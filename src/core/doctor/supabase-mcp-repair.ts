import path from 'node:path';
import { nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { mcpServerBlock, mcpServerExplicitlyDisabled, readProjectCodexConfig, replaceOrAppendMcpServerBlock } from '../mcp/mcp-config-preservation.js';

export interface SupabaseMcpRepairReport {
  schema: 'sks.doctor-supabase-mcp-repair.v1';
  generated_at: string;
  ok: boolean;
  apply: boolean;
  configured: boolean;
  disabled: boolean;
  disabled_preserved: boolean;
  token_env_present: boolean;
  unsafe_write_access: boolean;
  read_only_migrated: boolean;
  write_scope_requires_confirmation: boolean;
  ready_blocking: boolean;
  manual_required: boolean;
  next_action: string | null;
  blockers: string[];
  warnings: string[];
  raw_secret_values_recorded: false;
}

export async function repairSupabaseMcp(input: { root: string; apply?: boolean; reportPath?: string | null }): Promise<SupabaseMcpRepairReport> {
  const root = path.resolve(input.root);
  const config = await readProjectCodexConfig(root);
  const disabled = mcpServerExplicitlyDisabled(config.text, 'supabase') || mcpServerExplicitlyDisabled(config.text, 'supabase_sauron');
  const block = mcpServerBlock(config.text, 'supabase') || '';
  const configured = Boolean(block);
  const tokenEnvPresent = Boolean(process.env.SUPABASE_ACCESS_TOKEN);
  const readOnlyBefore = /read[_-]?only\s*=\s*true|access_mode\s*=\s*"read-only"|--read-only/.test(block);
  const unsafeWriteAccessBefore = configured && !disabled && !readOnlyBefore && /write|service_role|SUPABASE_ACCESS_TOKEN/.test(block);
  let afterText = config.text;
  let readOnlyMigrated = false;
  if (configured && !disabled && !readOnlyBefore && input.apply) {
    afterText = replaceOrAppendMcpServerBlock(config.text, 'supabase', setReadOnly(block));
    readOnlyMigrated = afterText !== config.text;
    if (readOnlyMigrated) await writeTextAtomic(config.path, afterText);
  }
  const afterBlock = readOnlyMigrated ? mcpServerBlock(afterText, 'supabase') || '' : block;
  const readOnlyAfter = /read[_-]?only\s*=\s*true|access_mode\s*=\s*"read-only"|--read-only/.test(afterBlock);
  const unsafeWriteAccess = configured && !disabled && !readOnlyAfter && /write|service_role|SUPABASE_ACCESS_TOKEN/.test(afterBlock);
  const writeScopeRequiresConfirmation = configured && !disabled && (unsafeWriteAccessBefore || !readOnlyAfter);
  const readyBlocking = unsafeWriteAccess;
  const manualRequired = configured && !disabled && (!tokenEnvPresent || writeScopeRequiresConfirmation);
  const report: SupabaseMcpRepairReport = {
    schema: 'sks.doctor-supabase-mcp-repair.v1',
    generated_at: nowIso(),
    ok: !configured || disabled || !unsafeWriteAccess,
    apply: input.apply === true,
    configured,
    disabled,
    disabled_preserved: disabled,
    token_env_present: tokenEnvPresent,
    unsafe_write_access: unsafeWriteAccess,
    read_only_migrated: readOnlyMigrated,
    write_scope_requires_confirmation: writeScopeRequiresConfirmation,
    ready_blocking: readyBlocking,
    manual_required: manualRequired,
    next_action: manualRequired
      ? tokenEnvPresent
        ? 'Set persistent Supabase MCP to read-only. Write-scoped Supabase MCP is allowed only through a mission-local MadDB runtime profile.'
        : 'Set SUPABASE_ACCESS_TOKEN only when an explicit MadDB run needs Supabase MCP auth; otherwise keep persistent Supabase MCP disabled/read-only.'
      : null,
    blockers: readyBlocking ? ['supabase_mcp_write_access_not_safe_by_default'] : [],
    warnings: [
      ...(configured && !tokenEnvPresent ? ['supabase_access_token_unset_write_features_manual_required'] : []),
      ...(readOnlyMigrated ? ['supabase_mcp_migrated_to_read_only'] : [])
    ],
    raw_secret_values_recorded: false
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'doctor-supabase-mcp-repair.json'), report).catch(() => undefined);
  return report;
}

function setReadOnly(block: string): string {
  const lines = String(block || '').replace(/\s*$/, '').split(/\r?\n/);
  const index = lines.findIndex((line) => /^\s*read[_-]?only\s*=/.test(line));
  if (index >= 0) lines[index] = 'read_only = true';
  else lines.push('read_only = true');
  return `${lines.join('\n')}\n`;
}

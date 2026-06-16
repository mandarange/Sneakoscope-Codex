import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { mcpServerBlock, mcpServerExplicitlyDisabled, readProjectCodexConfig } from '../mcp/mcp-config-preservation.js';

export interface SupabaseMcpRepairReport {
  schema: 'sks.doctor-supabase-mcp-repair.v1';
  generated_at: string;
  ok: boolean;
  apply: boolean;
  configured: boolean;
  disabled: boolean;
  token_env_present: boolean;
  unsafe_write_access: boolean;
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
  const unsafeWriteAccess = configured && !/read[_-]?only\s*=\s*true|access_mode\s*=\s*"read-only"|--read-only/.test(block) && /write|service_role|SUPABASE_ACCESS_TOKEN/.test(block);
  const manualRequired = configured && !disabled && (!tokenEnvPresent || unsafeWriteAccess);
  const report: SupabaseMcpRepairReport = {
    schema: 'sks.doctor-supabase-mcp-repair.v1',
    generated_at: nowIso(),
    ok: !configured || disabled || !unsafeWriteAccess,
    apply: input.apply === true,
    configured,
    disabled,
    token_env_present: tokenEnvPresent,
    unsafe_write_access: unsafeWriteAccess,
    manual_required: manualRequired,
    next_action: manualRequired
      ? tokenEnvPresent
        ? 'Set Supabase MCP to read-only or explicitly approve write-scoped MCP use.'
        : 'Set SUPABASE_ACCESS_TOKEN only if Supabase write MCP features are required; otherwise keep Supabase MCP disabled/read-only.'
      : null,
    blockers: unsafeWriteAccess ? ['supabase_mcp_write_access_not_safe_by_default'] : [],
    warnings: configured && !tokenEnvPresent ? ['supabase_access_token_unset_write_features_manual_required'] : [],
    raw_secret_values_recorded: false
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'doctor-supabase-mcp-repair.json'), report).catch(() => undefined);
  return report;
}

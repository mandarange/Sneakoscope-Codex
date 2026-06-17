import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { missingAgentConfigFiles } from './agent-config-file-repair.js';
import { managedAgentRoleConfigForFile, managedAgentRoleConfigForRole } from '../agents/agent-role-config.js';

export async function postcheckCodexStartupConfig(input: { root: string; reportPath?: string | null }) {
  const root = path.resolve(input.root);
  const configPath = path.join(root, '.codex', 'config.toml');
  const text = await fs.readFile(configPath, 'utf8').catch(() => '');
  const missing = await missingAgentConfigFiles(text);
  const managedBlocks = managedAgentBlocks(text);
  const unsupportedRoleFields = managedBlocks.some((block) => /^\s*message_role_prefix\s*=/m.test(block.text));
  const relativePaths = managedBlocks
    .map((block) => block.text.match(/^\s*config_file\s*=\s*"([^"]+)"/m)?.[1])
    .filter((file): file is string => Boolean(file && !path.isAbsolute(file)));
  const tomlSmoke = tomlSyntaxSmoke(text);
  const orphanChildTables = orphanMcpChildTables(text);
  const report = {
    schema: 'sks.codex-startup-config-postcheck.v1',
    generated_at: nowIso(),
    ok: missing.length === 0 && relativePaths.length === 0 && !unsupportedRoleFields && tomlSmoke.ok && orphanChildTables.length === 0,
    config_path: configPath,
    missing_config_files: missing,
    relative_config_files: relativePaths,
    unsupported_managed_role_fields: unsupportedRoleFields,
    toml_syntax_smoke_ok: tomlSmoke.ok,
    orphan_mcp_child_tables: orphanChildTables,
    blockers: [
      ...missing.map((file) => `missing_agent_config_file:${file}`),
      ...relativePaths.map((file) => `relative_agent_config_file:${file}`),
      ...(unsupportedRoleFields ? ['unsupported_message_role_prefix_field'] : []),
      ...tomlSmoke.blockers,
      ...orphanChildTables.map((table) => `orphan_mcp_child_table:${table}`)
    ]
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'codex-startup-config-postcheck.json'), report).catch(() => undefined);
  return report;
}

function managedAgentBlocks(text: string): Array<{ header: string; text: string }> {
  const blocks = tomlBlocks(text);
  return blocks.filter((block) => {
    if (!block.header.startsWith('agents.')) return false;
    const role = block.header.slice('agents.'.length);
    if (managedAgentRoleConfigForRole(role)) return true;
    const configFile = block.text.match(/^\s*config_file\s*=\s*"([^"]+)"/m)?.[1] || '';
    return Boolean(configFile && managedAgentRoleConfigForFile(configFile));
  });
}

function tomlBlocks(text: string): Array<{ header: string; text: string }> {
  const source = String(text || '');
  const matches = [...source.matchAll(/(^|\n)\s*\[([^\]]+)\]\s*(?:#.*)?(?:\n|$)/g)];
  return matches.map((match, index) => {
    const start = Number(match.index || 0) + (match[1] ? 1 : 0);
    const next = matches[index + 1];
    const end = next ? Number(next.index || 0) + (next[1] ? 1 : 0) : source.length;
    return { header: String(match[2] || '').trim(), text: source.slice(start, end) };
  });
}

function tomlSyntaxSmoke(text: string): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  for (const [index, line] of String(text || '').split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[')) continue;
    if (!/^\[[^\]]+\]\s*(?:#.*)?$/.test(trimmed)) blockers.push(`toml_table_header_invalid:${index + 1}`);
  }
  const tripleQuotes = (String(text || '').match(/"""/g) || []).length;
  if (tripleQuotes % 2 !== 0) blockers.push('toml_multiline_string_unbalanced');
  return { ok: blockers.length === 0, blockers };
}

function orphanMcpChildTables(text: string): string[] {
  const headers = new Set(tomlBlocks(text).map((block) => block.header));
  return [...headers].filter((header) => {
    const match = header.match(/^mcp_servers\.([^.]+)\./);
    return Boolean(match && !headers.has(`mcp_servers.${match[1]}`));
  });
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { managedAgentRoleConfigForFile, managedAgentRoleConfigForRole } from '../agents/agent-role-config.js';
import { isUnmanagedProjectCodexConfig, writeCodexConfigGuarded } from './codex-config-guard.js';

export interface AgentConfigFileRepairReport {
  schema: 'sks.agent-config-file-repair.v1';
  generated_at: string;
  ok: boolean;
  apply: boolean;
  config_path: string;
  repaired_paths: string[];
  created_files: string[];
  removed_unsupported_fields: string[];
  skipped_unmanaged_paths: string[];
  manual_required: boolean;
  blockers: string[];
}

export async function repairAgentConfigFileReferences(input: { root: string; apply?: boolean; reportPath?: string | null }): Promise<AgentConfigFileRepairReport> {
  const root = path.resolve(input.root);
  const configPath = path.join(root, '.codex', 'config.toml');
  const configExists = await fs.stat(configPath).then((stat) => stat.isFile()).catch(() => false);
  const original = configExists ? await fs.readFile(configPath, 'utf8').catch(() => '') : minimalManagedConfigToml();
  if (input.apply && configExists && isUnmanagedProjectCodexConfig(root, configPath, original)) {
    const report: AgentConfigFileRepairReport = {
      schema: 'sks.agent-config-file-repair.v1',
      generated_at: nowIso(),
      ok: false,
      apply: true,
      config_path: configPath,
      repaired_paths: [],
      created_files: [],
      removed_unsupported_fields: [],
      skipped_unmanaged_paths: [],
      manual_required: true,
      blockers: ['user_owned_file_without_sks_marker']
    };
    if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'agent-config-file-repair.json'), report).catch(() => undefined);
    return report;
  }
  const createdFiles: string[] = [];
  const repairedPaths: string[] = [];
  const removedUnsupportedFields: string[] = [];
  const skippedUnmanagedPaths: string[] = [];
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  let text = original;
  for (const block of tomlBlocks(original)) {
    const managed = managedBlockTarget(root, block);
    const currentConfigFile = stringValue(block.text, 'config_file');
    if (!managed) {
      if (currentConfigFile && !path.isAbsolute(currentConfigFile)) skippedUnmanagedPaths.push(currentConfigFile);
      continue;
    }
    const target = path.join(root, '.codex', 'agents', managed.file);
    let replacement = removeKey(block.text, 'message_role_prefix', removedUnsupportedFields);
    replacement = replaceOrInsertKey(replacement, 'config_file', `"${escapeToml(target)}"`);
    if (replacement !== block.text) {
      edits.push({ start: block.start, end: block.end, replacement });
      repairedPaths.push(target);
    }
    if (input.apply) {
      const exists = await fs.stat(target).then((stat) => stat.isFile()).catch(() => false);
      if (!exists) {
        await ensureDir(path.dirname(target));
        await writeTextAtomic(target, managed.content);
        createdFiles.push(target);
      }
    }
  }
  if (edits.length) text = applyEdits(original, edits);
  if (input.apply && !configExists) {
    await ensureDir(path.dirname(configPath));
    await writeCodexConfigGuarded({
      root,
      configPath,
      before: '',
      cause: 'agent-config-file-repair',
      mutate: () => text.replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n')
    });
    createdFiles.push(configPath);
  } else if (input.apply && text !== original) {
    await writeCodexConfigGuarded({
      root,
      configPath,
      before: original,
      cause: 'agent-config-file-repair',
      mutate: () => text.replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n')
    });
  }
  const effectiveText = input.apply ? await fs.readFile(configPath, 'utf8').catch(() => text) : text;
  const missing = await missingAgentConfigFiles(effectiveText);
  const unsupportedManagedFields = managedAgentBlocks(effectiveText)
    .flatMap((block) => block.text.split(/\r?\n/).filter((line) => /^\s*message_role_prefix\s*=/.test(line)));
  const report: AgentConfigFileRepairReport = {
    schema: 'sks.agent-config-file-repair.v1',
    generated_at: nowIso(),
    ok: missing.length === 0 && !/^\s*message_role_prefix\s*=/m.test(text),
    apply: input.apply === true,
    config_path: configPath,
    repaired_paths: repairedPaths,
    created_files: createdFiles,
    removed_unsupported_fields: removedUnsupportedFields,
    skipped_unmanaged_paths: skippedUnmanagedPaths,
    manual_required: skippedUnmanagedPaths.length > 0,
    blockers: [
      ...missing.map((file) => `missing_agent_config_file:${file}`),
      ...unsupportedManagedFields.map(() => 'unsupported_message_role_prefix_field')
    ]
  };
  report.ok = report.blockers.length === 0;
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'agent-config-file-repair.json'), report).catch(() => undefined);
  return report;
}

export async function missingAgentConfigFiles(text: string): Promise<string[]> {
  const rows = managedAgentBlocks(text)
    .map((block) => stringValue(block.text, 'config_file'))
    .filter((file): file is string => Boolean(file));
  const missing: string[] = [];
  for (const file of rows) {
    if (!path.isAbsolute(file)) {
      missing.push(file);
      continue;
    }
    const ok = await fs.stat(file).then((stat) => stat.isFile()).catch(() => false);
    if (!ok) missing.push(file);
  }
  return missing;
}

interface TomlBlock {
  header: string;
  start: number;
  end: number;
  text: string;
}

function tomlBlocks(text: string): TomlBlock[] {
  const source = String(text || '');
  const matches = [...source.matchAll(/(^|\n)\s*\[([^\]]+)\]\s*(?:#.*)?(?:\n|$)/g)];
  return matches.map((match, index) => {
    const start = Number(match.index || 0) + (match[1] ? 1 : 0);
    const next = matches[index + 1];
    const end = next ? Number(next.index || 0) + (next[1] ? 1 : 0) : source.length;
    return {
      header: String(match[2] || '').trim(),
      start,
      end,
      text: source.slice(start, end)
    };
  });
}

function managedAgentBlocks(text: string): TomlBlock[] {
  return tomlBlocks(text).filter((block) => Boolean(managedBlockTarget(process.cwd(), block)));
}

function managedBlockTarget(root: string, block: TomlBlock): { file: string; content: string } | null {
  if (!block.header.startsWith('agents.')) return null;
  const role = block.header.slice('agents.'.length);
  const byRole = managedAgentRoleConfigForRole(role);
  if (byRole) return byRole;
  const configFile = stringValue(block.text, 'config_file');
  if (configFile) {
    const content = managedAgentRoleConfigForFile(configFile);
    if (content) return { file: path.basename(configFile), content };
  }
  if (/SKS managed|sks_/i.test(block.text)) {
    const fallback = managedAgentRoleConfigForRole(role);
    if (fallback) return fallback;
  }
  void root;
  return null;
}

function stringValue(text: string, key: string): string | null {
  const match = text.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, 'm'));
  return match && typeof match[1] === 'string' ? match[1] : null;
}

function removeKey(text: string, key: string, removed: string[]): string {
  return text.split(/\r?\n/).filter((line) => {
    const match = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(line);
    if (match) removed.push(line.trim());
    return !match;
  }).join('\n');
}

function replaceOrInsertKey(text: string, key: string, encodedValue: string): string {
  const lines = text.replace(/\s*$/, '').split('\n');
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  const index = lines.findIndex((line) => re.test(line));
  if (index >= 0) lines[index] = `${key} = ${encodedValue}`;
  else lines.push(`${key} = ${encodedValue}`);
  return `${lines.join('\n')}\n`;
}

function applyEdits(text: string, edits: Array<{ start: number; end: number; replacement: string }>): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((current, edit) => `${current.slice(0, edit.start)}${edit.replacement}${current.slice(edit.end)}`, text);
}

function escapeToml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function minimalManagedConfigToml(): string {
  return [
    'service_tier = "fast"',
    '',
    '[features]',
    'hooks = true',
    'multi_agent = true',
    'fast_mode = true',
    'apps = true',
    '',
    '[mcp_servers.context7]',
    'url = "https://mcp.context7.com/mcp"',
    '',
    agentConfigBlock('native_agent', 'SKS native agent with bounded write capability.', './agents/native-agent-intake.toml', ['Analysis', 'Mapper']),
    '',
    agentConfigBlock('team_consensus', 'SKS planning/debate agent with bounded write capability.', './agents/team-consensus.toml', ['Consensus', 'Atlas']),
    '',
    agentConfigBlock('implementation_worker', 'SKS bounded implementation worker.', './agents/implementation-worker.toml', ['Builder', 'Mason']),
    '',
    agentConfigBlock('db_safety_reviewer', 'DB safety reviewer with bounded write capability.', './agents/db-safety-reviewer.toml', ['Sentinel', 'Ledger']),
    '',
    agentConfigBlock('qa_reviewer', 'QA reviewer with bounded write capability.', './agents/qa-reviewer.toml', ['Verifier', 'Reviewer']),
    ''
  ].join('\n');
}

function agentConfigBlock(table: string, description: string, configFile: string, nicknames: string[] = []): string {
  return [
    `[agents.${table}]`,
    `description = "${description}"`,
    `config_file = "${configFile}"`,
    `nickname_candidates = [${nicknames.map((name) => `"${name}"`).join(', ')}]`
  ].join('\n');
}

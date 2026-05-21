import path from 'node:path';
import os from 'node:os';
import { exists, readJson, readText } from '../fsx.js';
import { CODEX_HOOK_EVENTS } from './codex-schema-snapshot.js';
import { matcherApplies } from '../codex-hooks/codex-hook-config-writer.js';

const SUPPORTED_HANDLER_FIELDS = new Set(['type', 'command', 'commandWindows', 'command_windows', 'timeout', 'async', 'statusMessage']);

export function validateCodexHookConfigText(text: unknown, opts: any = {}) {
  const issues: string[] = [];
  const source = opts.source || 'config';
  const value = String(text || '');
  if (/allow_managed_hooks_only\s*=/.test(value) && /config\.toml$/.test(source)) {
    issues.push(`${source}:allow_managed_hooks_only_in_config_toml`);
  }
  for (const match of value.matchAll(/\[\[hooks\.([^\]]+)\]\]/g)) {
    const event = match[1] || '';
    if (!CODEX_HOOK_EVENTS.includes(event as any)) issues.push(`${source}:unsupported_hook_event:${event}`);
  }
  for (const group of matcherGroups(value)) {
    if (!CODEX_HOOK_EVENTS.includes(group.event as any)) continue;
    if (!matcherApplies(group.event as any) && group.matcher) issues.push(`${source}:matcher_not_applicable:${group.event}`);
    if (matcherApplies(group.event as any) && group.matcher && !validMatcher(group.matcher)) issues.push(`${source}:invalid_matcher:${group.event}`);
  }
  for (const block of commandHookBlocks(value)) {
    for (const key of block.keys) {
      if (!SUPPORTED_HANDLER_FIELDS.has(key)) issues.push(`${source}:unsupported_hook_field:${key}`);
    }
    if (block.type && block.type !== 'command') issues.push(`${source}:unsupported_hook_handler:${block.type}`);
    if (block.async === true) issues.push(`${source}:async_hook_not_supported`);
    if (block.command != null && !String(block.command).trim()) issues.push(`${source}:empty_hook_command`);
    if (block.timeout != null && Number(block.timeout) < 1) issues.push(`${source}:timeout_less_than_1`);
    if (block.statusMessage != null && !String(block.statusMessage).trim()) issues.push(`${source}:empty_statusMessage`);
  }
  return {
    schema: 'sks.codex-hook-config-policy.v1',
    ok: issues.length === 0,
    source,
    issues
  };
}

export function validateCodexHooksJsonConfig(value: any, opts: any = {}) {
  const issues: string[] = [];
  const source = opts.source || 'hooks.json';
  const hooks = value?.hooks && typeof value.hooks === 'object' && !Array.isArray(value.hooks) ? value.hooks : {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!CODEX_HOOK_EVENTS.includes(event as any)) {
      issues.push(`${source}:unsupported_hook_event:${event}`);
      continue;
    }
    if (!Array.isArray(groups)) {
      issues.push(`${source}:event_groups_not_array:${event}`);
      continue;
    }
    groups.forEach((group: any, groupIndex: number) => {
      const matcher = typeof group?.matcher === 'string' ? group.matcher : '';
      if (!matcherApplies(event as any) && matcher) issues.push(`${source}:matcher_not_applicable:${event}:${groupIndex}`);
      if (matcherApplies(event as any) && matcher && !validMatcher(matcher)) issues.push(`${source}:invalid_matcher:${event}:${groupIndex}`);
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      if (!handlers.length) issues.push(`${source}:empty_hook_group:${event}:${groupIndex}`);
      handlers.forEach((handler: any, handlerIndex: number) => {
        if (!handler || typeof handler !== 'object') {
          issues.push(`${source}:invalid_hook_handler:${event}:${groupIndex}:${handlerIndex}`);
          return;
        }
        if (handler.type !== 'command') issues.push(`${source}:unsupported_hook_handler:${handler.type || 'missing'}:${event}:${groupIndex}:${handlerIndex}`);
        if (!String(handler.command || '').trim()) issues.push(`${source}:empty_hook_command:${event}:${groupIndex}:${handlerIndex}`);
        if (handler.async === true) issues.push(`${source}:async_hook_not_supported:${event}:${groupIndex}:${handlerIndex}`);
        if (handler.timeout != null && Number(handler.timeout) < 1) issues.push(`${source}:timeout_less_than_1:${event}:${groupIndex}:${handlerIndex}`);
        if (handler.statusMessage != null && !String(handler.statusMessage).trim()) issues.push(`${source}:empty_statusMessage:${event}:${groupIndex}:${handlerIndex}`);
        for (const key of Object.keys(handler)) {
          if (!SUPPORTED_HANDLER_FIELDS.has(key)) issues.push(`${source}:unsupported_hook_field:${key}:${event}:${groupIndex}:${handlerIndex}`);
        }
      });
    });
  }
  return {
    schema: 'sks.codex-hooks-json-policy.v1',
    ok: issues.length === 0,
    source,
    issues
  };
}

export async function detectDualHookRepresentation(root: string) {
  const layers = [
    { name: 'user', hooksJson: path.join(os.homedir(), '.codex', 'hooks.json'), configToml: path.join(os.homedir(), '.codex', 'config.toml') },
    { name: 'project', hooksJson: path.join(root, '.codex', 'hooks.json'), configToml: path.join(root, '.codex', 'config.toml') }
  ];
  const issues: string[] = [];
  const reports = [];
  for (const layer of layers) {
    const hooksJsonExists = await exists(layer.hooksJson);
    const configToml = await readText(layer.configToml, '');
    const configHasHooks = /^\s*\[\[hooks\./m.test(String(configToml || ''));
    if (hooksJsonExists && configHasHooks) issues.push(`${layer.name}:hooks_json_and_config_toml_hooks_both_present`);
    reports.push({ ...layer, hooks_json_exists: hooksJsonExists, config_toml_has_hooks: configHasHooks });
  }
  return {
    schema: 'sks.codex-hook-dual-representation.v1',
    ok: issues.length === 0,
    layers: reports,
    issues
  };
}

export async function validateCodexHookConfigFiles(root: string) {
  const tomlCandidates = [
    path.join(os.homedir(), '.codex', 'config.toml'),
    path.join(root, '.codex', 'config.toml'),
    path.join(os.homedir(), '.codex', 'requirements.toml'),
    path.join(root, '.codex', 'requirements.toml')
  ];
  const jsonCandidates = [
    path.join(os.homedir(), '.codex', 'hooks.json'),
    path.join(root, '.codex', 'hooks.json')
  ];
  const files = [];
  for (const file of tomlCandidates) {
    if (!(await exists(file))) {
      files.push({ path: file, exists: false, ok: true, issues: [] as string[] });
      continue;
    }
    const report = validateCodexHookConfigText(await readText(file, ''), { source: file });
    files.push({ path: file, exists: true, ok: report.ok, issues: report.issues });
  }
  for (const file of jsonCandidates) {
    if (!(await exists(file))) {
      files.push({ path: file, exists: false, ok: true, issues: [] as string[] });
      continue;
    }
    const report = validateCodexHooksJsonConfig(await readJson(file, {}), { source: file });
    files.push({ path: file, exists: true, ok: report.ok, issues: report.issues });
  }
  const dual = await detectDualHookRepresentation(root);
  const issues = [...files.flatMap((file) => file.issues), ...dual.issues];
  return {
    schema: 'sks.codex-hook-config-files.v1',
    ok: issues.length === 0,
    files,
    dual_representation: dual,
    issues
  };
}

function commandHookBlocks(text: string) {
  const lines = text.split(/\r?\n/);
  const blocks: Array<{ keys: string[]; type: string | null; command: string | null; timeout: number | null; async: boolean | null; statusMessage: string | null }> = [];
  let inCommand = false;
  let keys: string[] = [];
  let block = emptyCommandBlock();
  for (const line of lines) {
    if (/^\s*\[\[hooks\.[^.]+\.(?:hooks)\]\]\s*$/.test(line)) {
      if (inCommand) blocks.push({ ...block, keys });
      inCommand = true;
      keys = [];
      block = emptyCommandBlock();
      continue;
    }
    if (/^\s*\[/.test(line)) {
      if (inCommand) blocks.push({ ...block, keys });
      inCommand = false;
      keys = [];
      block = emptyCommandBlock();
      continue;
    }
    if (!inCommand) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match?.[1]) continue;
    const key = match[1];
    keys.push(key);
    const raw = line.replace(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, '').trim();
    if (key === 'type') block.type = unquoteToml(raw);
    if (key === 'command') block.command = unquoteToml(raw);
    if (key === 'timeout') block.timeout = Number(raw);
    if (key === 'async') block.async = raw === 'true';
    if (key === 'statusMessage') block.statusMessage = unquoteToml(raw);
  }
  if (inCommand) blocks.push({ ...block, keys });
  return blocks;
}

function matcherGroups(text: string) {
  const lines = text.split(/\r?\n/);
  const groups: Array<{ event: string; matcher: string | null }> = [];
  let current: { event: string; matcher: string | null } | null = null;
  for (const line of lines) {
    const header = line.match(/^\s*\[\[hooks\.([^\].]+)\]\]\s*$/);
    if (header?.[1]) {
      if (current) groups.push(current);
      current = { event: header[1], matcher: null };
      continue;
    }
    if (/^\s*\[\[hooks\.[^.]+\.(?:hooks)\]\]\s*$/.test(line)) continue;
    if (/^\s*\[/.test(line)) {
      if (current) groups.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const matcher = line.match(/^\s*matcher\s*=\s*(.+)$/);
    if (matcher?.[1]) current.matcher = unquoteToml(matcher[1].trim());
  }
  if (current) groups.push(current);
  return groups;
}

type TomlCommandBlock = {
  type: string | null;
  command: string | null;
  timeout: number | null;
  async: boolean | null;
  statusMessage: string | null;
};

function emptyCommandBlock(): TomlCommandBlock {
  return { type: null, command: null, timeout: null, async: null, statusMessage: null };
}

function unquoteToml(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function validMatcher(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === '*') return true;
  try {
    new RegExp(trimmed);
    return true;
  } catch {
    return false;
  }
}

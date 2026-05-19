import path from 'node:path';
import os from 'node:os';
import { exists, readText } from '../fsx.js';
import { CODEX_HOOK_EVENTS } from './codex-schema-snapshot.js';

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
  for (const block of commandHookBlocks(value)) {
    for (const key of block.keys) {
      if (!SUPPORTED_HANDLER_FIELDS.has(key)) issues.push(`${source}:unsupported_hook_field:${key}`);
    }
  }
  return {
    schema: 'sks.codex-hook-config-policy.v1',
    ok: issues.length === 0,
    source,
    issues
  };
}

export async function validateCodexHookConfigFiles(root: string) {
  const candidates = [
    path.join(os.homedir(), '.codex', 'config.toml'),
    path.join(root, '.codex', 'config.toml'),
    path.join(os.homedir(), '.codex', 'requirements.toml'),
    path.join(root, '.codex', 'requirements.toml')
  ];
  const files = [];
  for (const file of candidates) {
    if (!(await exists(file))) {
      files.push({ path: file, exists: false, ok: true, issues: [] as string[] });
      continue;
    }
    const report = validateCodexHookConfigText(await readText(file, ''), { source: file });
    files.push({ path: file, exists: true, ok: report.ok, issues: report.issues });
  }
  const issues = files.flatMap((file) => file.issues);
  return {
    schema: 'sks.codex-hook-config-files.v1',
    ok: issues.length === 0,
    files,
    issues
  };
}

function commandHookBlocks(text: string) {
  const lines = text.split(/\r?\n/);
  const blocks: Array<{ keys: string[] }> = [];
  let inCommand = false;
  let keys: string[] = [];
  for (const line of lines) {
    if (/^\s*\[\[hooks\.[^.]+\.(?:hooks)\]\]\s*$/.test(line)) {
      if (inCommand) blocks.push({ keys });
      inCommand = true;
      keys = [];
      continue;
    }
    if (/^\s*\[/.test(line)) {
      if (inCommand) blocks.push({ keys });
      inCommand = false;
      keys = [];
      continue;
    }
    if (!inCommand) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) keys.push(match[1]);
  }
  if (inCommand) blocks.push({ keys });
  return blocks;
}

import { sha256 } from '../fsx.js';
import { codexHookEventStateKey, type CodexHookEventName } from '../codex-compat/codex-hook-events.js';

export type CodexCommandHookIdentity = {
  event: CodexHookEventName;
  matcher?: string | null;
  command: string;
  timeout?: number | null;
  async?: boolean;
  statusMessage?: string | null;
  commandWindows?: string | null;
};

export function codexHookStateKey(sourcePath: string, event: CodexHookEventName, groupIndex = 0, handlerIndex = 0): string {
  return `${sourcePath}:${codexHookEventStateKey(event)}:${groupIndex}:${handlerIndex}`;
}

/**
 * The `currentHash` Codex reports from `hooks/list` (checked against Codex
 * 0.153.4, 0.157.1 and 0.158): the group's matcher and handlers sit beside
 * `event_name` at the top level. A hash nested under `group` never matches,
 * so every trusted_hash written that way read as untrusted.
 */
export function codexCommandHookCurrentHash(identity: CodexCommandHookIdentity): string {
  const hashed: Record<string, unknown> = { event_name: codexHookEventStateKey(identity.event) };
  if (identity.matcher != null && String(identity.matcher).trim()) hashed.matcher = String(identity.matcher);
  hashed.hooks = [normalizedCommandHook(identity)];
  return `sha256:${sha256(canonicalJson(hashed))}`;
}

export function normalizedCommandHook(identity: CodexCommandHookIdentity): Record<string, unknown> {
  const hook: Record<string, unknown> = {
    type: 'command',
    command: String(identity.command || ''),
    timeout: Math.max(1, Number(identity.timeout || 600)),
    async: identity.async === true
  };
  const statusMessage = String(identity.statusMessage || '').trim();
  if (statusMessage) hook.statusMessage = statusMessage;
  const commandWindows = String(identity.commandWindows || '').trim();
  if (commandWindows) hook.commandWindows = commandWindows;
  return hook;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined && item !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

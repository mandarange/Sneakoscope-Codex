import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CODEX_HOOK_EVENTS, codexHookEventName, type CodexHookEventName } from '../codex-compat/codex-hook-events.js';
import { codexCommandHookCurrentHash, codexHookStateKey } from './codex-hook-hash.js';
import { parseTrustedHashes } from './codex-hook-trust-state.js';

/** Marks the handlers SKS installs in the user-level `$CODEX_HOME/hooks.json`. */
export const SKS_USER_HOOK_SCOPE_FLAG = '--scope=user';

const SKS_HOOK_SUBCOMMAND = /\bhook\s+(?:session-start|user-prompt-submit|pre-tool|post-tool|permission-request|pre-compact|post-compact|subagent-start|subagent-stop|stop)\b/;
const SKS_BINARY = /\b(?:sks|sneakoscope|sks\.js)\b/;

export function isSksHookCommand(command: unknown): boolean {
  const text = String(command || '');
  return SKS_HOOK_SUBCOMMAND.test(text) && SKS_BINARY.test(text);
}

export function isSksHookHandler(hook: unknown): boolean {
  if (!hook || typeof hook !== 'object' || Array.isArray(hook)) return false;
  const handler = hook as { type?: unknown; command?: unknown };
  return handler.type === 'command' && isSksHookCommand(handler.command);
}

export function isUserScopeSksHookCommand(command: unknown): boolean {
  return isSksHookCommand(command) && String(command || '').includes(SKS_USER_HOOK_SCOPE_FLAG);
}

/**
 * A project hook that runs that project's own SKS build — the SKS source
 * repository's `./dist/bin/sks.js` or a project-local install — instead of
 * the global CLI. Only these stay in a project once the user-level hooks are
 * active; the user-level hook steps aside for them.
 */
export function isProjectPinnedSksHookCommand(command: unknown, root: string): boolean {
  const text = String(command || '');
  if (!isSksHookCommand(text) || isUserScopeSksHookCommand(text)) return false;
  if (/(?:^|[\s'"])\.{1,2}[\\/][^\s'"]*sks\.js\b/.test(text)) return true;
  for (const candidate of text.match(/(?:[A-Za-z]:)?[\\/][^\s'"]*sks\.js\b/g) || []) {
    if (isInside(path.resolve(root), path.resolve(candidate))) return true;
  }
  return false;
}

export interface SksHookHandlerRef {
  event: CodexHookEventName;
  group_index: number;
  handler_index: number;
  key: string;
  hash: string;
  command: string;
  user_scope: boolean;
}

/** Every SKS command handler in one hooks.json, keyed and hashed the way Codex keys and hashes it. */
export function sksHookHandlerRefs(hooksFile: unknown, hooksPath: string): SksHookHandlerRef[] {
  const root = hooksFile && typeof hooksFile === 'object' && !Array.isArray(hooksFile) ? (hooksFile as { hooks?: unknown }).hooks : null;
  const hooks = root && typeof root === 'object' && !Array.isArray(root) ? root as Record<string, unknown> : {};
  const refs: SksHookHandlerRef[] = [];
  for (const event of CODEX_HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] as any[] : [];
    groups.forEach((group, groupIndex) => {
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      handlers.forEach((handler: any, handlerIndex: number) => {
        if (!isSksHookHandler(handler)) return;
        const command = String(handler.command);
        refs.push({
          event,
          group_index: groupIndex,
          handler_index: handlerIndex,
          key: codexHookStateKey(hooksPath, event, groupIndex, handlerIndex),
          hash: codexCommandHookCurrentHash({
            event,
            matcher: typeof group.matcher === 'string' ? group.matcher : null,
            command,
            timeout: Number(handler.timeout || 600),
            async: handler.async === true,
            statusMessage: typeof handler.statusMessage === 'string' ? handler.statusMessage : null,
            commandWindows: typeof handler.commandWindows === 'string' ? handler.commandWindows : null
          }),
          command,
          user_scope: isUserScopeSksHookCommand(command)
        });
      });
    });
  }
  return refs;
}

/**
 * The source path Codex puts in a hook's trust key: the canonical path
 * (`/var/...` on macOS keys as `/private/var/...`). A key built from a
 * symlinked path never matches, so the hook reads as untrusted.
 */
export async function codexSourcePath(file: string): Promise<string> {
  const resolved = path.resolve(file);
  const real = await fsp.realpath(resolved).catch(() => null);
  if (real) return real;
  const dir = await fsp.realpath(path.dirname(resolved)).catch(() => path.dirname(resolved));
  return path.join(dir, path.basename(resolved));
}

/** Same resolution as codexHomePath, without that module's import graph (this runs inside every hook). */
export function codexHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.CODEX_HOME || path.join(env.HOME || os.homedir(), '.codex'));
}

export interface CodexTrustState {
  trustedHashes: Record<string, string>;
  trustedProjects: Set<string>;
}

/** Codex reads hook trust and project trust only from the user config.toml. */
export function parseCodexTrustState(configText: string): CodexTrustState {
  const trustedProjects = new Set<string>();
  let project: string | null = null;
  for (const line of String(configText || '').split(/\r?\n/)) {
    const header = line.match(/^\s*\[projects\."((?:\\"|[^"])*)"\]\s*$/);
    if (header?.[1]) {
      project = header[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      continue;
    }
    if (/^\s*\[/.test(line)) {
      project = null;
      continue;
    }
    if (project && /^\s*trust_level\s*=\s*"trusted"\s*$/.test(line)) trustedProjects.add(path.resolve(project));
  }
  return { trustedHashes: parseTrustedHashes(configText), trustedProjects };
}

export function hookEventForSubcommand(name: unknown): CodexHookEventName | null {
  return codexHookEventName(name);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

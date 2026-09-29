import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exists, readJson, readText } from '../fsx.js';
import { CODEX_HOOK_EVENTS, type CodexHookEventName } from '../codex-compat/codex-hook-events.js';
import { codexCommandHookCurrentHash, codexHookStateKey } from './codex-hook-hash.js';

export type CodexHookTrustStatus = 'Managed' | 'Trusted' | 'Modified' | 'Untrusted';

export type CodexHookTrustEntry = {
  source_path: string;
  source_kind: 'project' | 'user';
  event: CodexHookEventName;
  group_index: number;
  handler_index: number;
  matcher: string | null;
  command: string;
  timeout: number;
  async: boolean;
  statusMessage: string | null;
  key: string;
  current_hash: string;
  trusted_hash: string | null;
  trust_status: CodexHookTrustStatus;
  repair_action: string | null;
  warnings: string[];
};

export async function readCodexHookTrustEntries(root: string, opts: { managed?: boolean } = {}): Promise<CodexHookTrustEntry[]> {
  // Codex reads hook trust only from the user config.toml, for project hooks too.
  const codexHome = path.resolve(process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'));
  const userConfig = path.join(codexHome, 'config.toml');
  const candidates = [
    { source_path: path.join(root, '.codex', 'hooks.json'), source_kind: 'project' as const, state_path: userConfig },
    { source_path: path.join(codexHome, 'hooks.json'), source_kind: 'user' as const, state_path: userConfig }
  ];
  const entries: CodexHookTrustEntry[] = [];
  for (const candidate of candidates) {
    if (!(await exists(candidate.source_path))) continue;
    const hooks = await readJson(candidate.source_path, {});
    const stateText = await readText(candidate.state_path, '');
    const trustedHashes = parseTrustedHashes(String(stateText || ''));
    const sourcePath = await fsp.realpath(candidate.source_path).catch(() => candidate.source_path);
    entries.push(...entriesFromHooksFile(sourcePath, candidate.source_kind, hooks, trustedHashes, opts.managed === true));
  }
  return entries;
}

export function entriesFromHooksFile(
  sourcePath: string,
  sourceKind: 'project' | 'user',
  hooksFile: any,
  trustedHashes: Record<string, string> = {},
  managed = false
): CodexHookTrustEntry[] {
  const entries: CodexHookTrustEntry[] = [];
  const hooksRoot = hooksFile?.hooks && typeof hooksFile.hooks === 'object' && !Array.isArray(hooksFile.hooks) ? hooksFile.hooks : {};
  for (const event of CODEX_HOOK_EVENTS) {
    const groups = Array.isArray(hooksRoot[event]) ? hooksRoot[event] : [];
    groups.forEach((group: any, groupIndex: number) => {
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      handlers.forEach((handler: any, handlerIndex: number) => {
        if (!handler || typeof handler !== 'object' || handler.type !== 'command') return;
        const matcher = typeof group.matcher === 'string' ? group.matcher : null;
        const command = String(handler.command || '');
        const timeout = Math.max(1, Number(handler.timeout || 600));
        const currentHash = codexCommandHookCurrentHash({
          event,
          matcher,
          command,
          timeout,
          async: handler.async === true,
          statusMessage: typeof handler.statusMessage === 'string' ? handler.statusMessage : null,
          commandWindows: typeof handler.commandWindows === 'string' ? handler.commandWindows : typeof handler.command_windows === 'string' ? handler.command_windows : null
        });
        const key = codexHookStateKey(sourcePath, event, groupIndex, handlerIndex);
        const trustedHash = trustedHashes[key] || null;
        const trustStatus = managed ? 'Managed' : trustedHash === currentHash ? 'Trusted' : trustedHash ? 'Modified' : 'Untrusted';
        entries.push({
          source_path: sourcePath,
          source_kind: sourceKind,
          event,
          group_index: groupIndex,
          handler_index: handlerIndex,
          matcher,
          command,
          timeout,
          async: handler.async === true,
          statusMessage: typeof handler.statusMessage === 'string' ? handler.statusMessage : null,
          key,
          current_hash: currentHash,
          trusted_hash: trustedHash,
          trust_status: trustStatus,
          repair_action: trustStatus === 'Managed' || trustStatus === 'Trusted' ? null : `sks hooks trust-fix --json --key ${JSON.stringify(key)}`,
          warnings: trustStatus === 'Managed' || trustStatus === 'Trusted' ? [] : [`${trustStatus} hook: ${key}`]
        });
      });
    });
  }
  return entries;
}

export function parseTrustedHashes(tomlText: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  const lines = String(tomlText || '').split(/\r?\n/);
  let key: string | null = null;
  for (const line of lines) {
    const header = line.match(/^\s*\[hooks\.state\."((?:\\"|[^"])*)"\]\s*$/);
    if (header?.[1]) {
      key = header[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      continue;
    }
    const hash = line.match(/^\s*trusted_hash\s*=\s*"([^"]+)"\s*$/);
    if (key && hash?.[1]) hashes[key] = hash[1];
  }
  return hashes;
}


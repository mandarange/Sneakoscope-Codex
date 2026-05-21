import path from 'node:path';
import { readJson, readText, writeTextAtomic } from '../fsx.js';
import { CODEX_HOOK_EVENTS } from '../codex-compat/codex-hook-events.js';
import { codexCommandHookCurrentHash, codexHookStateKey } from './codex-hook-hash.js';

export async function writeTrustedHashStateForHooksFile(root: string, hooksPath = path.join(root, '.codex', 'hooks.json'), statePath = path.join(root, '.codex', 'config.toml')) {
  const hooksFile = await readJson(hooksPath, {});
  const blocks = trustedHashBlocksForHooksFile(hooksPath, hooksFile);
  const next = upsertTrustBlocks(await readText(statePath, ''), blocks);
  await writeTextAtomic(statePath, next);
  return {
    schema: 'sks.codex-hook-state-writer.v1',
    ok: true,
    hooks_path: hooksPath,
    state_path: statePath,
    updated: blocks.length,
    blocks
  };
}

export function trustedHashBlocksForHooksFile(hooksPath: string, hooksFile: any): Array<{ key: string; trusted_hash: string; block: string }> {
  const blocks: Array<{ key: string; trusted_hash: string; block: string }> = [];
  const hooksRoot = hooksFile?.hooks && typeof hooksFile.hooks === 'object' && !Array.isArray(hooksFile.hooks) ? hooksFile.hooks : {};
  for (const event of CODEX_HOOK_EVENTS) {
    const groups = Array.isArray(hooksRoot[event]) ? hooksRoot[event] : [];
    groups.forEach((group: any, groupIndex: number) => {
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      handlers.forEach((handler: any, handlerIndex: number) => {
        if (!handler || typeof handler !== 'object' || handler.type !== 'command') return;
        const key = codexHookStateKey(hooksPath, event, groupIndex, handlerIndex);
        const trustedHash = codexCommandHookCurrentHash({
          event,
          matcher: typeof group.matcher === 'string' ? group.matcher : null,
          command: String(handler.command || ''),
          timeout: Number(handler.timeout || 600),
          async: handler.async === true,
          statusMessage: typeof handler.statusMessage === 'string' ? handler.statusMessage : null,
          commandWindows: typeof handler.commandWindows === 'string' ? handler.commandWindows : typeof handler.command_windows === 'string' ? handler.command_windows : null
        });
        blocks.push({
          key,
          trusted_hash: trustedHash,
          block: `[hooks.state."${tomlQuotedKey(key)}"]\ntrusted_hash = "${trustedHash}"`
        });
      });
    });
  }
  return blocks;
}

export function upsertTrustBlocks(existing: string, blocks: Array<{ key: string; block: string }>): string {
  let next = String(existing || '').trimEnd();
  for (const block of blocks) {
    next = upsertTomlTable(next, `hooks.state."${tomlQuotedKey(block.key)}"`, block.block);
  }
  return `${next.trim()}\n`;
}

function upsertTomlTable(text: string, table: string, block: string): string {
  let lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  const blockLines = String(block || '').trim().split('\n');
  if (start === -1) return [...lines, ...(lines.length ? [''] : []), ...blockLines].join('\n').replace(/\n{3,}/g, '\n\n');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  lines.splice(start, end - start, ...blockLines);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function tomlQuotedKey(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

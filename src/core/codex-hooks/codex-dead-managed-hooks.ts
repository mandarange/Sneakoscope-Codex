import fsp from 'node:fs/promises';
import path from 'node:path';
import { exists, readText, writeTextAtomic } from '../fsx.js';
import { writeCodexConfigGuarded } from '../codex/codex-config-guard.js';

const SKS_MANAGED_HOOKS_TOML = 'sks-managed-hooks.toml';
const SKS_MANAGED_HOOK_SCRIPT = 'sks-managed-hook.sh';

/**
 * Remove the requirements.toml `managed_dir` hook install SKS wrote into
 * `$CODEX_HOME` and project `.codex` directories. Codex (checked through
 * 0.158) never loads hooks from those files and ignores their
 * `allow_managed_hooks_only`, so the install ran nowhere while SKS reported
 * it as active. Only what SKS wrote is removed: its two files, its
 * `managed_dir` line, the `allow_managed_hooks_only` it paired with that
 * line, and (in the user config) its trust tables for the managed file.
 */
export async function removeDeadSksManagedHooks(input: {
  codexDir: string;
  trustConfigPath?: string | null;
  guardRoot?: string;
  /**
   * An update from 10.3.8 or older ends with that version's own check, which
   * counts these managed hooks; keep them (inert) for it and drop only
   * `allow_managed_hooks_only`, the one line that could ever disable hooks.
   */
  keepManagedDirForLegacyVerifier?: boolean;
}): Promise<{ actions: string[]; warnings: string[] }> {
  const codexDir = path.resolve(input.codexDir);
  const managedDir = path.join(codexDir, 'managed-hooks');
  const managedToml = path.join(managedDir, SKS_MANAGED_HOOKS_TOML);
  const actions: string[] = [];
  const warnings: string[] = [];

  const requirementsPath = path.join(codexDir, 'requirements.toml');
  const requirements = await readText(requirementsPath, null);
  if (input.keepManagedDirForLegacyVerifier === true) {
    if (typeof requirements === 'string' && /^\s*allow_managed_hooks_only\s*=\s*true\s*$/m.test(requirements)) {
      await writeTextAtomic(requirementsPath, `${requirements.replace(/^\s*allow_managed_hooks_only\s*=\s*true\s*$\n?/gm, '').replace(/^\n+/, '')}`);
      actions.push('removed_allow_managed_hooks_only');
    }
    return { actions, warnings };
  }
  if (typeof requirements === 'string') {
    const stripped = stripSksManagedHookRequirements(requirements, requirementsPath, managedDir);
    if (stripped.changed) {
      if (stripped.text.trim()) await writeTextAtomic(requirementsPath, stripped.text);
      else await fsp.rm(requirementsPath, { force: true });
      actions.push(stripped.text.trim() ? 'removed_sks_managed_dir_requirement' : 'removed_sks_requirements_toml');
    }
  }

  let removedFiles = 0;
  for (const name of [SKS_MANAGED_HOOKS_TOML, SKS_MANAGED_HOOK_SCRIPT]) {
    const file = path.join(managedDir, name);
    if (!(await exists(file))) continue;
    await fsp.rm(file, { force: true });
    removedFiles += 1;
  }
  if (removedFiles) {
    actions.push('removed_sks_managed_hook_files');
    const left = await fsp.readdir(managedDir).catch(() => null);
    if (left && left.length === 0) await fsp.rmdir(managedDir).catch(() => undefined);
  }

  if (input.trustConfigPath) {
    const prefix = `${managedToml}:`;
    const configText = await readText(input.trustConfigPath, '');
    if (configText.includes(prefix)) {
      const written = await writeCodexConfigGuarded({
        root: input.guardRoot || codexDir,
        configPath: input.trustConfigPath,
        cause: 'sks-dead-managed-hooks-cleanup',
        backupTag: 'dead-managed-hooks',
        ownershipVerified: true,
        preserveTextFormatting: true,
        mutate: (before) => removeHookStateTables(before, prefix)
      });
      if (written.ok) actions.push('removed_sks_managed_hook_trust_tables');
      else warnings.push(`dead_managed_hook_trust_cleanup_skipped:${written.status}`);
    }
  }
  return { actions, warnings };
}

export function stripSksManagedHookRequirements(text: string, requirementsPath: string, managedDir: string): { text: string; changed: boolean } {
  const lines = String(text || '').split(/\r?\n/);
  let table: string | null = null;
  let hooksHeader = -1;
  let hooksKeys = 0;
  const drop = new Set<number>();
  lines.forEach((line, index) => {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header?.[1]) {
      table = header[1].trim();
      if (table === 'hooks') hooksHeader = index;
      return;
    }
    if (table !== 'hooks' || !line.trim() || /^\s*#/.test(line)) return;
    const managed = line.match(/^\s*managed_dir\s*=\s*["']([^"']+)["']\s*$/);
    if (managed?.[1] && path.resolve(path.dirname(requirementsPath), managed[1]) === path.resolve(managedDir)) drop.add(index);
    else hooksKeys += 1;
  });
  if (!drop.size) return { text, changed: false };
  if (hooksHeader >= 0 && hooksKeys === 0) drop.add(hooksHeader);
  lines.forEach((line, index) => {
    if (/^\s*allow_managed_hooks_only\s*=\s*true\s*$/.test(line)) drop.add(index);
  });
  const next = lines.filter((_, index) => !drop.has(index)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: next ? `${next}\n` : '', changed: true };
}

export function removeHookStateTables(text: string, keyPrefix: string): string {
  const lines = String(text || '').split('\n');
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[(.+)\]\s*$/);
    if (header) {
      const key = header[1]!.match(/^hooks\.state\."((?:\\"|[^"])*)"$/)?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      skipping = Boolean(key && key.startsWith(keyPrefix));
      if (skipping) continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

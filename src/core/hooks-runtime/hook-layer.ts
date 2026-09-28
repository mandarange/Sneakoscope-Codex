import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, readText, writeTextAtomic } from '../fsx.js';
import {
  SKS_USER_HOOK_SCOPE_FLAG,
  codexHomeDir,
  codexSourcePath,
  hookEventForSubcommand,
  isProjectPinnedSksHookCommand,
  parseCodexTrustState,
  sksHookHandlerRefs
} from '../codex-hooks/sks-hook-entries.js';

export type HookLayer = 'user' | 'project';

export function hookLayerFromArgs(args: readonly unknown[] = []): HookLayer {
  return args.some((arg) => String(arg) === SKS_USER_HOOK_SCOPE_FLAG) ? 'user' : 'project';
}

/**
 * Exactly one SKS layer acts per hook event. The user-level hook steps aside
 * when the project pins its own SKS build and Codex will run that hook (the
 * project is trusted and the handler's trust matches); a project hook that
 * runs the global CLI steps aside when the user-level hook is active. Each
 * side defers only when it is certain the other side runs.
 */
export async function hookLayerDeferral(input: {
  layer: HookLayer;
  hookName: string;
  root: string;
  runningPackageRoot: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ defer: boolean; reason: string }> {
  const event = hookEventForSubcommand(input.hookName);
  if (!event) return { defer: false, reason: 'unknown_event' };
  const codexHome = codexHomeDir(input.env || process.env);
  const root = path.resolve(input.root);
  const projectHooksPath = path.join(root, '.codex', 'hooks.json');
  const userHooksPath = path.join(codexHome, 'hooks.json');
  if (projectHooksPath === userHooksPath) return { defer: false, reason: 'project_is_codex_home' };
  const trust = parseCodexTrustState(await readText(path.join(codexHome, 'config.toml'), ''));
  if (input.layer === 'user') {
    const realRoot = await fsp.realpath(root).catch(() => root);
    if (!trust.trustedProjects.has(root) && !trust.trustedProjects.has(realRoot)) return { defer: false, reason: 'project_untrusted' };
    const refs = sksHookHandlerRefs(await readJsonOrNull(projectHooksPath), await codexSourcePath(projectHooksPath));
    const pinned = refs.some((ref) => ref.event === event
      && isProjectPinnedSksHookCommand(ref.command, root)
      && trust.trustedHashes[ref.key] === ref.hash);
    return pinned ? { defer: true, reason: 'project_pinned_sks_hook_active' } : { defer: false, reason: 'user_layer_owner' };
  }
  if (isInside(root, path.resolve(input.runningPackageRoot))) return { defer: false, reason: 'project_pinned_owner' };
  const refs = sksHookHandlerRefs(await readJsonOrNull(userHooksPath), await codexSourcePath(userHooksPath));
  const active = refs.some((ref) => ref.event === event && ref.user_scope && trust.trustedHashes[ref.key] === ref.hash);
  return active ? { defer: true, reason: 'user_sks_hook_active' } : { defer: false, reason: 'project_layer_owner' };
}

const SKS_STATE_IGNORE = /^\s*\/?\.sneakoscope\/?\s*$/m;

/**
 * The hooks keep state in `<project>/.sneakoscope/`, now in projects that
 * never ran `sks setup` too. Keep it out of git through the repository's
 * local `info/exclude`, never the tracked `.gitignore`. Checked once per
 * project.
 */
export async function ensureSksStateGitExcluded(root: string): Promise<'excluded' | 'already_ignored' | 'checked' | 'no_git' | 'no_state'> {
  const stateDir = path.join(path.resolve(root), '.sneakoscope', 'state');
  const marker = path.join(stateDir, 'git-exclude-checked');
  if (!(await fsp.stat(stateDir).catch(() => null))?.isDirectory()) return 'no_state';
  if (await fsp.stat(marker).catch(() => null)) return 'checked';
  const gitDir = await gitCommonDir(root);
  if (!gitDir) return 'no_git';
  let status: 'excluded' | 'already_ignored' = 'already_ignored';
  if (!SKS_STATE_IGNORE.test(await readText(path.join(root, '.gitignore'), ''))) {
    const excludePath = path.join(gitDir, 'info', 'exclude');
    const current = await readText(excludePath, '');
    if (!SKS_STATE_IGNORE.test(current)) {
      await ensureDir(path.dirname(excludePath));
      await writeTextAtomic(excludePath, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}# Sneakoscope Codex runtime state\n.sneakoscope/\n`);
      status = 'excluded';
    }
  }
  await writeTextAtomic(marker, `${new Date().toISOString()}\n`);
  return status;
}

async function gitCommonDir(root: string): Promise<string | null> {
  const dotGit = path.join(path.resolve(root), '.git');
  const stat = await fsp.stat(dotGit).catch(() => null);
  if (!stat) return null;
  if (stat.isDirectory()) return dotGit;
  const gitdir = (await readText(dotGit, '')).match(/^gitdir:\s*(.+?)\s*$/m)?.[1];
  if (!gitdir) return null;
  const resolved = path.resolve(path.dirname(dotGit), gitdir);
  const common = (await readText(path.join(resolved, 'commondir'), '')).trim();
  return common ? path.resolve(resolved, common) : resolved;
}

async function readJsonOrNull(file: string): Promise<unknown> {
  const text = await readText(file, '');
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

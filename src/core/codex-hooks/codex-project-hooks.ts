import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson, readText, writeTextAtomic } from '../fsx.js';
import { removeDeadSksManagedHooks } from './codex-dead-managed-hooks.js';
import { globalHookPaths, globalHookWritesAllowed, installGlobalSksHooks, writeHookTrust, type InstallGlobalSksHooksReport } from './codex-global-hooks.js';
import type { CodexHooksLister } from './codex-hooks-list.js';
import { codexSourcePath, isProjectPinnedSksHookCommand, isSksHookHandler, sksHookHandlerRefs } from './sks-hook-entries.js';

export const SKS_HOOK_ACTIVATION_SCHEMA = 'sks.codex-hook-activation.v1';

/**
 * Make SKS hooks run for every Codex project: the user-level hooks, then this
 * project's leftovers. `sks update` (hook-trust-refresh), `sks setup`, and
 * `sks doctor --fix` all converge through here.
 */
export async function activateSksCodexHooks(input: {
  root: string;
  env?: NodeJS.ProcessEnv;
  verify?: boolean;
  listHooks?: CodexHooksLister;
  keepLegacyManagedDir?: boolean;
}) {
  const env = input.env || process.env;
  const global = await installGlobalSksHooks({
    env,
    keepLegacyManagedDir: input.keepLegacyManagedDir === true,
    ...(input.verify === undefined ? {} : { verify: input.verify }),
    ...(input.listHooks ? { listHooks: input.listHooks } : {})
  });
  const project = await reconcileProjectSksHooks(input.root, { env, globalActive: global.active });
  return {
    schema: SKS_HOOK_ACTIVATION_SCHEMA,
    ok: global.ok && project.ok,
    active: global.active,
    global,
    project,
    actions: [...global.actions, ...project.actions],
    blockers: [...global.blockers, ...project.blockers],
    warnings: [...global.warnings, ...project.warnings]
  };
}

export type { InstallGlobalSksHooksReport };

/**
 * Once the user-level hooks are active, a project keeps only SKS hooks pinned
 * to its own build (the SKS source repo, a project-local install); the rest
 * would run SKS twice per event. Codex reads hook trust only from the user
 * config, so the pinned handlers' trust is written there.
 */
export async function reconcileProjectSksHooks(root: string, input: { env?: NodeJS.ProcessEnv; globalActive: boolean }) {
  const env = input.env || process.env;
  const paths = globalHookPaths(env);
  const hooksPath = path.join(path.resolve(root), '.codex', 'hooks.json');
  const actions: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  // Run from $HOME, the "project" .codex is the user Codex home itself.
  if (await samePath(path.dirname(hooksPath), paths.codexHome)) return { ok: true, actions, warnings, blockers, pinned_events: [] as string[] };

  const dead = await removeDeadSksManagedHooks({ codexDir: path.dirname(hooksPath) });
  actions.push(...dead.actions.map((action) => `project_${action}`));
  warnings.push(...dead.warnings);

  if (input.globalActive) {
    const stripped = await stripUnpinnedSksProjectHooks(root);
    if (stripped.invalid) warnings.push('project_hooks_json_invalid');
    if (stripped.removed) actions.push(stripped.deleted ? 'removed_project_sks_hooks_file' : 'removed_unpinned_project_sks_hooks');
  }
  const hooks = await readJson(hooksPath, null).catch(() => null);
  const pinned = sksHookHandlerRefs(hooks, await codexSourcePath(hooksPath)).filter((ref) => isProjectPinnedSksHookCommand(ref.command, root));
  const trust = globalHookWritesAllowed(env)
    ? await writeHookTrust(paths, pinned.map((ref) => ({ key: ref.key, hash: ref.hash })))
    : { changed: false, blocker: null };
  if (trust.changed) actions.push('pinned_project_hook_trust_written');
  if (trust.blocker) blockers.push(trust.blocker);
  return { ok: blockers.length === 0, actions, warnings, blockers, pinned_events: [...new Set(pinned.map((ref) => ref.event as string))] };
}

export async function stripUnpinnedSksProjectHooks(root: string): Promise<{ removed: number; deleted: boolean; invalid: boolean }> {
  const hooksPath = path.join(path.resolve(root), '.codex', 'hooks.json');
  const text = await readText(hooksPath, null);
  if (typeof text !== 'string' || !text.trim()) return { removed: 0, deleted: false, invalid: false };
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { removed: 0, deleted: false, invalid: true };
  }
  const hooks = parsed?.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return { removed: 0, deleted: false, invalid: false };
  let removed = 0;
  const nextHooks: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      nextHooks[event] = groups;
      continue;
    }
    const keptGroups = groups.flatMap((group: any) => {
      if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) return [group];
      const kept = group.hooks.filter((hook: any) => !isSksHookHandler(hook) || isProjectPinnedSksHookCommand(hook.command, root));
      removed += group.hooks.length - kept.length;
      if (kept.length === group.hooks.length) return [group];
      return kept.length ? [{ ...group, hooks: kept }] : [];
    });
    if (keptGroups.length) nextHooks[event] = keptGroups;
  }
  if (!removed) return { removed, deleted: false, invalid: false };
  const { hooks: _hooks, ...rest } = parsed;
  if (!Object.keys(nextHooks).length && !Object.keys(rest).length) {
    await fsp.rm(hooksPath, { force: true });
    return { removed, deleted: true, invalid: false };
  }
  await writeTextAtomic(hooksPath, `${JSON.stringify({ ...parsed, hooks: nextHooks }, null, 2)}\n`);
  return { removed, deleted: false, invalid: false };
}

async function samePath(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    fsp.realpath(a).catch(() => path.resolve(a)),
    fsp.realpath(b).catch(() => path.resolve(b))
  ]);
  return left === right;
}

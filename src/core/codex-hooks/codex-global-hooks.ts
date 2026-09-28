import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, exists, packageRoot, readJson, readText, writeTextAtomic } from '../fsx.js';
import { writeCodexConfigGuarded } from '../codex/codex-config-guard.js';
import { agentsBlockText, managedHookEventNames, mergeManagedHooksJson } from '../init.js';
import { isVerificationTestHarness } from '../verification-profile.js';
import { upsertTrustBlocks } from './codex-hook-state-writer.js';
import { removeDeadSksManagedHooks } from './codex-dead-managed-hooks.js';
import type { CodexHooksLister, CodexHooksListResult } from './codex-hooks-list.js';
import {
  SKS_USER_HOOK_SCOPE_FLAG,
  codexHomeDir,
  codexSourcePath,
  parseCodexTrustState,
  sksHookHandlerRefs,
  type SksHookHandlerRef
} from './sks-hook-entries.js';

export const SKS_GLOBAL_HOOKS_SCHEMA = 'sks.codex-global-hooks.v1';
export const GLOBAL_AGENTS_MARKER = 'Sneakoscope Codex GLOBAL MANAGED BLOCK';

/**
 * SKS hooks live in the user-level `$CODEX_HOME/hooks.json`, the one hook
 * source Codex loads for every project, trusted or not. Each handler runs a
 * launcher that `sks update` retargets, so the hooks, and the trust Codex
 * records for them, stay the same across updates.
 */
export interface GlobalHookPaths {
  codexHome: string;
  hooksPath: string;
  configPath: string;
  agentsPath: string;
  launcherPath: string;
  guardRoot: string;
}

export interface GlobalHookTarget {
  node: string | null;
  entry: string | null;
  source: 'installed_package' | 'previous_launcher' | 'path_lookup';
}

export function globalHookPaths(env: NodeJS.ProcessEnv = process.env): GlobalHookPaths {
  const codexHome = codexHomeDir(env);
  const home = env.HOME || os.homedir();
  return {
    codexHome,
    hooksPath: path.join(codexHome, 'hooks.json'),
    configPath: path.join(codexHome, 'config.toml'),
    agentsPath: path.join(codexHome, 'AGENTS.md'),
    launcherPath: path.join(codexHome, 'sks', 'bin', 'sks-hook'),
    guardRoot: path.resolve(env.SKS_GLOBAL_ROOT || path.join(home, '.sneakoscope-global'))
  };
}

/** The command prefix for user-level handlers: the launcher, or `sks` on Windows where no sh launcher runs. */
export function globalHookCommandPrefix(launcherPath: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'sks' : shellQuote(launcherPath);
}

export function globalHookLauncherScript(target: GlobalHookTarget): string {
  return [
    '#!/bin/sh',
    '# Sneakoscope Codex hook launcher. SKS manages this file and `sks update` rewrites it.',
    '# Runs the installed SKS, then `sks` on PATH, and does nothing when neither exists.',
    `node=${shellQuote(target.node || '')}`,
    `entry=${shellQuote(target.entry || '')}`,
    'if [ -n "$node" ] && [ -x "$node" ] && [ -f "$entry" ]; then exec "$node" "$entry" "$@"; fi',
    'if command -v sks >/dev/null 2>&1; then exec sks "$@"; fi',
    'exit 0'
  ].join('\n') + '\n';
}

/**
 * Point the launcher at the SKS that is running, but only when that is a
 * global install: a source checkout or a project-local install must not
 * become every project's hook runtime. Otherwise keep the previous target, or
 * fall back to `sks` on PATH.
 */
export async function resolveGlobalHookTarget(launcherPath: string, opts: { packageRootDir?: string; execPath?: string } = {}): Promise<GlobalHookTarget> {
  const pkg = path.resolve(opts.packageRootDir || packageRoot());
  const entry = path.join(pkg, 'dist', 'bin', 'sks.js');
  if (await exists(entry) && !(await isSourceCheckout(pkg)) && !(await isProjectLocalInstall(pkg))) {
    return { node: opts.execPath || process.execPath, entry, source: 'installed_package' };
  }
  const previous = parseLauncherTarget(await readText(launcherPath, ''));
  if (previous.node && previous.entry && await exists(previous.node) && await exists(previous.entry)) {
    return { ...previous, source: 'previous_launcher' };
  }
  return { node: null, entry: null, source: 'path_lookup' };
}

export function globalAgentsBlockText(): string {
  return agentsBlockText().replace('This repository uses Sneakoscope Codex.', () => 'Sneakoscope Codex is active in every Codex project for this user.');
}

export interface GlobalHookVerification {
  checked: boolean;
  codex_bin: string | null;
  active: boolean | null;
  missing_events: string[];
  disabled_events: string[];
  untrusted_events: string[];
  corrected_trust: number;
  blocker: string | null;
}

export interface InstallGlobalSksHooksReport {
  schema: typeof SKS_GLOBAL_HOOKS_SCHEMA;
  ok: boolean;
  active: boolean;
  codex_home: string;
  hooks_path: string;
  launcher_path: string;
  target: GlobalHookTarget;
  events: string[];
  actions: string[];
  verification: GlobalHookVerification | null;
  blockers: string[];
  warnings: string[];
}

export async function installGlobalSksHooks(input: {
  env?: NodeJS.ProcessEnv;
  target?: GlobalHookTarget;
  verify?: boolean;
  listHooks?: CodexHooksLister;
  keepLegacyManagedDir?: boolean;
} = {}): Promise<InstallGlobalSksHooksReport> {
  const env = input.env || process.env;
  const paths = globalHookPaths(env);
  const actions: string[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const events = managedHookEventNames(null);
  // A test process writes only a home it brought. A source checkout never
  // rewrites the real home's hooks: its dev commands and release checks run
  // migrations there, and every project must keep running the installed SKS
  // (SKS_GLOBAL_HOOKS_FROM_CHECKOUT=1 or an explicit target opts in). A
  // sandbox with its own home installs from either.
  const skipReason = !globalHookWritesAllowed(env)
    ? 'global_hooks_skipped_in_test_harness'
    : !input.target && env.SKS_GLOBAL_HOOKS_FROM_CHECKOUT !== '1' && protectedCodexHome(env) && await isSourceCheckout(path.resolve(packageRoot()))
      ? 'global_hooks_skipped_source_checkout'
      : null;
  const skipped = skipReason !== null;
  const target = skipped ? { node: null, entry: null, source: 'path_lookup' as const } : input.target || await resolveGlobalHookTarget(paths.launcherPath);
  const report = (verification: GlobalHookVerification | null): InstallGlobalSksHooksReport => ({
    schema: SKS_GLOBAL_HOOKS_SCHEMA,
    ok: blockers.length === 0,
    active: !skipped && blockers.length === 0 && verification?.active !== false,
    codex_home: paths.codexHome,
    hooks_path: paths.hooksPath,
    launcher_path: paths.launcherPath,
    target,
    events,
    actions,
    verification,
    blockers,
    warnings
  });
  if (skipReason) {
    warnings.push(skipReason);
    return report(null);
  }

  if (process.platform !== 'win32') {
    const script = globalHookLauncherScript(target);
    if (await readText(paths.launcherPath, '') !== script) {
      await ensureDir(path.dirname(paths.launcherPath));
      await writeTextAtomic(paths.launcherPath, script);
      actions.push('launcher_written');
    }
    await fsp.chmod(paths.launcherPath, 0o755).catch(() => undefined);
  }
  if (target.source === 'path_lookup') warnings.push('sks_hook_launcher_uses_path_lookup');

  const beforeHooks = await readText(paths.hooksPath, '');
  if (beforeHooks.trim() && !parsesAsObject(beforeHooks)) {
    blockers.push('user_hooks_json_invalid');
    return report(null);
  }
  const nextHooks = mergeManagedHooksJson(beforeHooks, globalHookCommandPrefix(paths.launcherPath), null, { commandSuffix: ` ${SKS_USER_HOOK_SCOPE_FLAG}` });
  if (nextHooks !== beforeHooks) {
    await ensureDir(path.dirname(paths.hooksPath));
    await writeTextAtomic(paths.hooksPath, nextHooks);
    actions.push('user_hooks_written');
  }
  const refs = sksHookHandlerRefs(JSON.parse(nextHooks), await codexSourcePath(paths.hooksPath)).filter((ref) => ref.user_scope);
  const trust = await writeHookTrust(paths, refs.map((ref) => ({ key: ref.key, hash: ref.hash })));
  if (trust.changed) actions.push('user_hook_trust_written');
  if (trust.blocker) blockers.push(trust.blocker);

  if (await upsertGlobalAgentsBlock(paths.agentsPath)) actions.push('global_agents_rules_written');
  const dead = await removeDeadSksManagedHooks({
    codexDir: paths.codexHome,
    trustConfigPath: paths.configPath,
    guardRoot: paths.guardRoot,
    keepManagedDirForLegacyVerifier: input.keepLegacyManagedDir === true
  });
  actions.push(...dead.actions);
  warnings.push(...dead.warnings);

  if (!(input.verify ?? defaultHookVerification(env)) || blockers.length) return report(null);
  let verification = await verifyGlobalSksHooks(paths, refs, env, input.listHooks);
  if (verification.checked && verification.corrections.length) {
    const corrected = await writeHookTrust(paths, verification.corrections);
    if (corrected.blocker) blockers.push(corrected.blocker);
    const recheck = await verifyGlobalSksHooks(paths, refs, env, input.listHooks);
    verification = { ...recheck, corrected_trust: verification.corrections.length };
  }
  if (!verification.checked) warnings.push(verification.blocker || 'codex_hooks_list_unavailable');
  else if (!verification.active) blockers.push(...verification.missing_events.map((event) => `sks_hook_not_loaded_by_codex:${event}`), ...verification.untrusted_events.map((event) => `sks_hook_untrusted_by_codex:${event}`));
  if (verification.disabled_events.length) warnings.push(...verification.disabled_events.map((event) => `sks_hook_disabled_in_codex:${event}`));
  const { corrections: _corrections, ...publicVerification } = verification;
  return report(publicVerification);
}

/** File-based view of the user-level hooks: what Codex will run, provided it loads the file. */
export async function readGlobalSksHookState(env: NodeJS.ProcessEnv = process.env) {
  const paths = globalHookPaths(env);
  const hooks = await readJson(paths.hooksPath, null).catch(() => null);
  const trust = parseCodexTrustState(await readText(paths.configPath, ''));
  const refs = sksHookHandlerRefs(hooks, await codexSourcePath(paths.hooksPath)).filter((ref) => ref.user_scope);
  const expected = managedHookEventNames(null);
  const installed = new Set(refs.map((ref) => ref.event as string));
  const trusted = new Set(refs.filter((ref) => trust.trustedHashes[ref.key] === ref.hash).map((ref) => ref.event as string));
  const launcherExists = process.platform === 'win32' || await exists(paths.launcherPath);
  const missing = expected.filter((event) => !installed.has(event));
  const untrusted = expected.filter((event) => installed.has(event) && !trusted.has(event));
  return {
    schema: 'sks.codex-global-hook-state.v1',
    active: launcherExists && missing.length === 0 && untrusted.length === 0,
    hooks_path: paths.hooksPath,
    launcher_path: paths.launcherPath,
    launcher_exists: launcherExists,
    missing_events: missing,
    untrusted_events: untrusted
  };
}

/** Uninstall: the launcher and the global rules block. Hook entries and trust tables are stripped by the config cleanup. */
export async function removeGlobalSksHookArtifacts(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const paths = globalHookPaths(env);
  const actions: string[] = [];
  if (await exists(paths.launcherPath)) {
    await fsp.rm(paths.launcherPath, { force: true });
    await fsp.rmdir(path.dirname(paths.launcherPath)).catch(() => undefined);
    actions.push('removed_sks_hook_launcher');
  }
  const agents = await readText(paths.agentsPath, null);
  if (typeof agents === 'string') {
    const next = removeManagedBlock(agents, GLOBAL_AGENTS_MARKER);
    if (next !== agents) {
      if (next.trim()) await writeTextAtomic(paths.agentsPath, next);
      else await fsp.rm(paths.agentsPath, { force: true });
      actions.push('removed_global_agents_rules');
    }
  }
  const dead = await removeDeadSksManagedHooks({ codexDir: paths.codexHome, trustConfigPath: paths.configPath, guardRoot: paths.guardRoot });
  return [...actions, ...dead.actions];
}

async function verifyGlobalSksHooks(
  paths: GlobalHookPaths,
  refs: SksHookHandlerRef[],
  env: NodeJS.ProcessEnv,
  listHooks?: CodexHooksLister
): Promise<GlobalHookVerification & { corrections: Array<{ key: string; hash: string }> }> {
  const lister = listHooks || (async (cwds: string[], listEnv: NodeJS.ProcessEnv) => (await import('./codex-hooks-list.js')).listCodexHooks({ cwds, env: listEnv }));
  const listed: CodexHooksListResult = await lister([os.tmpdir()], env).catch((err: unknown) => ({
    schema: 'sks.codex-hooks-list.v1' as const,
    ok: false,
    codex_bin: null,
    data: [],
    blocker: `codex_hooks_list_failed:${err instanceof Error ? err.message : String(err)}`
  }));
  const empty = { missing_events: [], disabled_events: [], untrusted_events: [], corrected_trust: 0, corrections: [] };
  if (!listed.ok) return { checked: false, codex_bin: null, active: null, blocker: listed.blocker, ...empty };
  const rows = listed.data.flatMap((entry) => entry.hooks || []);
  const hooksFile = new Set([path.resolve(paths.hooksPath), await fsp.realpath(paths.hooksPath).catch(() => path.resolve(paths.hooksPath))]);
  const missing: string[] = [];
  const disabled: string[] = [];
  const untrusted: string[] = [];
  const corrections: Array<{ key: string; hash: string }> = [];
  for (const ref of refs) {
    const row = rows.find((candidate) => candidate.source === 'user'
      && hooksFile.has(path.resolve(candidate.sourcePath))
      && String(candidate.eventName || '').toLowerCase() === ref.event.toLowerCase()
      && candidate.command === ref.command);
    if (!row) {
      missing.push(ref.event);
      continue;
    }
    if (row.enabled === false) disabled.push(ref.event);
    if (row.trustStatus !== 'trusted' && row.trustStatus !== 'managed') {
      untrusted.push(ref.event);
      corrections.push({ key: row.key, hash: row.currentHash });
    }
  }
  return {
    checked: true,
    codex_bin: listed.codex_bin,
    active: missing.length === 0 && untrusted.length === 0,
    missing_events: missing,
    disabled_events: disabled,
    untrusted_events: untrusted,
    corrected_trust: 0,
    corrections,
    blocker: null
  };
}

export async function writeHookTrust(paths: Pick<GlobalHookPaths, 'configPath' | 'guardRoot'>, entries: Array<{ key: string; hash: string }>): Promise<{ changed: boolean; blocker: string | null }> {
  if (!entries.length) return { changed: false, blocker: null };
  const before = await readText(paths.configPath, '');
  const trusted = parseCodexTrustState(before).trustedHashes;
  if (entries.every((entry) => trusted[entry.key] === entry.hash)) return { changed: false, blocker: null };
  const blocks = entries.map((entry) => ({ key: entry.key, block: `[hooks.state."${tomlQuotedKey(entry.key)}"]\ntrusted_hash = "${entry.hash}"` }));
  const written = await writeCodexConfigGuarded({
    root: paths.guardRoot,
    configPath: paths.configPath,
    cause: 'sks-hook-trust',
    backupTag: 'sks-hook-trust',
    ownershipVerified: true,
    preserveTextFormatting: true,
    mutate: (text) => upsertTrustBlocks(text, blocks)
  });
  return written.ok ? { changed: true, blocker: null } : { changed: false, blocker: `sks_hook_trust_write_failed:${written.status}` };
}

async function upsertGlobalAgentsBlock(agentsPath: string): Promise<boolean> {
  const begin = `<!-- BEGIN ${GLOBAL_AGENTS_MARKER} -->`;
  const end = `<!-- END ${GLOBAL_AGENTS_MARKER} -->`;
  const block = `${begin}\n${globalAgentsBlockText().trim()}\n${end}`;
  const current = await readText(agentsPath, '');
  if (current.includes(block)) return false;
  const start = current.indexOf(begin);
  const stop = current.indexOf(end);
  const next = start >= 0 && stop > start
    ? `${current.slice(0, start)}${block}${current.slice(stop + end.length)}`
    : `${current.trim() ? `${current.trimEnd()}\n\n` : ''}${block}\n`;
  await ensureDir(path.dirname(agentsPath));
  await writeTextAtomic(agentsPath, next);
  return true;
}

function removeManagedBlock(text: string, marker: string): string {
  const begin = `<!-- BEGIN ${marker} -->`;
  const end = `<!-- END ${marker} -->`;
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start < 0 || stop < start) return text;
  return `${text.slice(0, start).trimEnd()}\n${text.slice(stop + end.length).replace(/^\s*\n/, '')}`.replace(/^\n+/, '');
}

/**
 * A test process never writes user-level Codex state into a default home: the
 * canonical runner's shared home (SKS_TEST_DEFAULT_HOME) or the real account
 * home. A test that brings its own HOME or CODEX_HOME writes there, and
 * SKS_TEST_ALLOW_GLOBAL_HOOKS=1 opts in explicitly.
 */
export function globalHookWritesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isVerificationTestHarness(env) || env.SKS_TEST_ALLOW_GLOBAL_HOOKS === '1') return true;
  return !protectedCodexHome(env);
}

/** The real account's Codex home, or the canonical runner's shared default one. */
function protectedCodexHome(env: NodeJS.ProcessEnv): boolean {
  const homes = [env.SKS_TEST_DEFAULT_HOME, env.SKS_TEST_REAL_HOME, accountHome()]
    .filter((home): home is string => Boolean(home))
    .map((home) => path.resolve(home, '.codex'));
  return homes.includes(codexHomeDir(env));
}

function accountHome(): string | null {
  try {
    return os.userInfo().homedir || null;
  } catch {
    return null;
  }
}

/** Asking Codex spawns its app-server; the test harness opts in explicitly (SKS_HOOKS_VERIFY=1). */
function defaultHookVerification(env: NodeJS.ProcessEnv): boolean {
  if (env.SKS_HOOKS_VERIFY === '1') return true;
  if (env.SKS_HOOKS_VERIFY === '0') return false;
  return !isVerificationTestHarness(env);
}

async function isSourceCheckout(pkg: string): Promise<boolean> {
  return await exists(path.join(pkg, '.git')) || await exists(path.join(pkg, 'src', 'core', 'hooks-runtime.ts'));
}

/** A project dependency (`<project>/node_modules/sneakoscope` listed in that project's package.json), not a global install. */
async function isProjectLocalInstall(pkg: string): Promise<boolean> {
  if (path.basename(path.dirname(pkg)) !== 'node_modules') return false;
  const manifest = await readJson<any>(path.join(path.dirname(path.dirname(pkg)), 'package.json'), null).catch(() => null);
  return ['dependencies', 'devDependencies', 'optionalDependencies'].some((field) => Boolean(manifest?.[field]?.sneakoscope));
}

function parseLauncherTarget(text: string): { node: string | null; entry: string | null } {
  const read = (name: string) => {
    const match = String(text || '').match(new RegExp(`^${name}='([^']*)'$`, 'm'));
    return match?.[1] ? match[1] : null;
  };
  return { node: read('node'), entry: read('entry') };
}

function parsesAsObject(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  if (/[\0\r\n]/.test(value)) throw new Error('hook_command_path_invalid');
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function tomlQuotedKey(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

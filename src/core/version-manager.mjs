import path from 'node:path';
import fsp from 'node:fs/promises';
import { exists, nowIso, readJson, runProcess, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';

const VERSION_HOOK_MARKER = 'Sneakoscope Codex Version Guard';
const VERSION_STATE_FILE = 'sks-version-state.json';
const DEFAULT_BUMP = 'patch';

export async function installVersionGitHook(root, commandPrefix = 'sks') {
  void root;
  void commandPrefix;
  return {
    ok: false,
    installed: false,
    reason: 'pre_commit_hooks_unsupported',
    message: 'SKS no longer installs Git pre-commit hooks. Use `sks versioning bump` and release checks explicitly.'
  };
}

export async function disableVersionGitHook(root) {
  await setVersionPolicyEnabled(root, false);
  const git = await gitPaths(root);
  if (!git.ok) return { ok: true, disabled: true, hook_removed: false, reason: git.reason || 'not_git' };
  const current = await readFileMaybe(git.hook_path);
  if (!current.includes(`BEGIN ${VERSION_HOOK_MARKER}`)) {
    return { ok: true, disabled: true, hook_removed: false, hook_path: git.hook_path, reason: 'managed_hook_not_installed' };
  }
  const next = removeShellBlock(current, VERSION_HOOK_MARKER);
  if (next.trim() === '#!/bin/sh' || next.trim() === '#!/usr/bin/env sh' || !next.trim()) {
    await fsp.rm(git.hook_path, { force: true });
    return { ok: true, disabled: true, hook_removed: true, hook_path: git.hook_path };
  }
  await writeTextAtomic(git.hook_path, next);
  await fsp.chmod(git.hook_path, 0o755).catch(() => {});
  return { ok: true, disabled: true, hook_removed: true, hook_path: git.hook_path };
}

export async function versioningStatus(root) {
  const git = await gitPaths(root);
  const packagePath = path.join(root, 'package.json');
  const pkg = await readJson(packagePath, null);
  const version = typeof pkg?.version === 'string' ? pkg.version : null;
  if (!git.ok) return { ok: true, enabled: false, reason: git.reason || 'not_git', package_version: version };
  const hookText = await readFileMaybe(git.hook_path);
  const hookInstalled = hookText.includes(`BEGIN ${VERSION_HOOK_MARKER}`);
  const policy = await versionPolicy(root);
  const state = await readJson(path.join(git.common_dir, VERSION_STATE_FILE), {});
  const runtimeDrift = await runtimeDriftStatus(root, version);
  return {
    ok: (!policy.enabled || hookInstalled || !version) && runtimeDrift.ok,
    enabled: Boolean(policy.enabled && version),
    package_version: version,
    bump: policy.bump,
    hook_installed: hookInstalled,
    hook_path: git.hook_path,
    state_path: path.join(git.common_dir, VERSION_STATE_FILE),
    last_version: state.last_version || null,
    runtime_drift: runtimeDrift,
    reason: !policy.enabled ? 'disabled_by_policy' : (version ? null : 'package_json_version_missing')
  };
}

async function runtimeDriftStatus(root, packageVersion) {
  if (!packageVersion || process.env.SKS_RUNTIME_DRIFT_CHECK === '0') {
    return { ok: true, checked: false, reason: packageVersion ? 'disabled' : 'package_json_version_missing' };
  }
  const localBin = path.join(root, 'bin', 'sks.mjs');
  const useLocalBin = await exists(localBin);
  const command = useLocalBin ? process.execPath : 'sks';
  const args = useLocalBin ? [localBin, '--version'] : ['--version'];
  const result = await runProcess(command, args, {
    cwd: root,
    timeoutMs: 5000,
    maxOutputBytes: 16 * 1024,
    env: { SKS_RUNTIME_DRIFT_CHECK: '0' }
  });
  if (result.code !== 0) {
    return { ok: true, checked: false, reason: 'sks_binary_unavailable', stderr: result.stderr?.trim() || null };
  }
  const match = String(result.stdout || '').match(/(\d+\.\d+\.\d+)/);
  const runtimeVersion = match?.[1] || null;
  const runtime = parseSemver(runtimeVersion);
  const source = parseSemver(packageVersion);
  if (!runtime || !source) {
    return { ok: true, checked: true, reason: 'version_parse_unavailable', runtime_version: runtimeVersion, package_version: packageVersion };
  }
  const comparison = compareSemver(runtime, source);
  return {
    ok: comparison >= 0,
    checked: true,
    command: [command, ...args].join(' '),
    runtime_version: runtimeVersion,
    package_version: packageVersion,
    relation: comparison === 0 ? 'same' : (comparison > 0 ? 'runtime_newer' : 'runtime_older')
  };
}

export async function runVersionPreCommit(root, opts = {}) {
  if (process.env.SKS_DISABLE_VERSIONING === '1') return { ok: true, skipped: true, reason: 'SKS_DISABLE_VERSIONING=1' };
  const policy = await versionPolicy(root);
  if (!policy.enabled && !opts.force) return { ok: true, skipped: true, reason: 'disabled_by_policy' };
  const pkgPath = path.join(root, 'package.json');
  const pkg = await readJson(pkgPath, null);
  if (!pkg?.version) return { ok: true, skipped: true, reason: 'package_json_version_missing' };
  const git = await gitPaths(root);
  if (!git.ok) return { ok: true, skipped: true, reason: git.reason || 'not_git' };
  return withVersionLock(git.common_dir, async () => verifyProjectVersion(root, { ...opts, policy, git }));
}

export async function bumpProjectVersion(root, opts = {}) {
  const policy = opts.policy || await versionPolicy(root);
  const git = opts.git || await gitPaths(root);
  const pkgPath = path.join(root, 'package.json');
  const pkg = await readJson(pkgPath);
  const current = parseSemver(pkg.version);
  if (!current) return { ok: false, reason: `Unsupported package.json version: ${pkg.version}` };

  const statePath = git.ok ? path.join(git.common_dir, VERSION_STATE_FILE) : null;
  const state = statePath ? await readJson(statePath, {}) : {};
  const headPkg = await gitJson(root, 'HEAD:package.json');
  const headVersion = parseSemver(headPkg?.version);
  const stateVersion = parseSemver(state.last_version);
  const base = maxSemver([headVersion, stateVersion].filter(Boolean));
  const manualAlreadyBumped = base && compareSemver(current, base) > 0;
  const target = manualAlreadyBumped ? current : bumpSemver(base || current, policy.bump || DEFAULT_BUMP);
  const changed = compareSemver(current, target) !== 0;

  if (changed) {
    pkg.version = formatSemver(target);
    await writeJsonAtomic(pkgPath, pkg);
  }
  const targetVersion = formatSemver(target);
  const sourceVersion = await syncSourcePackageVersion(root, targetVersion);
  const changelog = await syncChangelogVersionSection(root, targetVersion);
  const synced = await syncPackageLockVersions(root, targetVersion);
  const staged = await stageVersionFiles(root, [pkgPath, ...synced.files, ...sourceVersion.files, ...changelog.files]);
  if (!staged.ok) return { ok: false, reason: 'git_add_version_files_failed', stderr: staged.stderr };
  if (statePath) {
    await writeJsonAtomic(statePath, {
      schema_version: 1,
      last_version: targetVersion,
      previous_version: pkg.version === targetVersion && !changed ? formatSemver(current) : formatSemver(current),
      updated_at: nowIso(),
      pid: process.pid,
      bump: policy.bump || DEFAULT_BUMP,
      changed
    });
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'version', 'last.json'), {
    schema_version: 1,
    version: targetVersion,
    previous_version: formatSemver(current),
    changed,
    synced_files: [...synced.relative_files, ...sourceVersion.relative_files, ...changelog.relative_files],
    staged_files: staged.relative_files,
    updated_at: nowIso()
  }).catch(() => {});
  return {
    ok: true,
    changed,
    version: targetVersion,
    previous_version: formatSemver(current),
    synced_files: [...synced.relative_files, ...sourceVersion.relative_files, ...changelog.relative_files],
    staged_files: staged.relative_files,
    lock_scope: git.common_dir
  };
}

export async function verifyProjectVersion(root, opts = {}) {
  const git = opts.git || await gitPaths(root);
  const pkgPath = path.join(root, 'package.json');
  const pkg = await readJson(pkgPath);
  const current = parseSemver(pkg.version);
  if (!current) return { ok: false, reason: `Unsupported package.json version: ${pkg.version}` };
  const version = formatSemver(current);
  const sourceVersion = await syncSourcePackageVersion(root, version);
  const synced = await syncPackageLockVersions(root, version);
  if (!await changelogHasVersionSection(root, version)) {
    return { ok: false, reason: 'changelog_section_missing', version, expected: `## [${version}]` };
  }
  const staged = await stageVersionFiles(root, [...synced.files, ...sourceVersion.files]);
  if (!staged.ok) return { ok: false, reason: 'git_add_version_files_failed', stderr: staged.stderr };
  const statePath = git.ok ? path.join(git.common_dir, VERSION_STATE_FILE) : null;
  if (statePath) {
    await writeJsonAtomic(statePath, {
      schema_version: 1,
      last_version: version,
      updated_at: nowIso(),
      pid: process.pid,
      mode: 'verify',
      changed: Boolean(synced.files.length || sourceVersion.files.length)
    });
  }
  return {
    ok: true,
    changed: Boolean(synced.files.length || sourceVersion.files.length),
    version,
    previous_version: version,
    synced_files: [...synced.relative_files, ...sourceVersion.relative_files],
    staged_files: staged.relative_files,
    lock_scope: git.common_dir,
    mode: 'verify'
  };
}

async function versionPolicy(root) {
  const policy = await readJson(path.join(root, '.sneakoscope', 'policy.json'), {});
  return {
    enabled: policy.versioning?.enabled === true,
    bump: policy.versioning?.bump || DEFAULT_BUMP
  };
}

async function setVersionPolicyEnabled(root, enabled) {
  const policyPath = path.join(root, '.sneakoscope', 'policy.json');
  const policy = await readJson(policyPath, {});
  await writeJsonAtomic(policyPath, {
    ...policy,
    git: {
      ...(policy.git || {}),
      versioning: {
        ...(policy.git?.versioning || {}),
        enabled: Boolean(enabled),
        bump: policy.git?.versioning?.bump || policy.versioning?.bump || DEFAULT_BUMP,
        lock: 'git-common-dir/sks-version.lock',
        state: 'git-common-dir/sks-version-state.json'
      }
    },
    versioning: {
      ...(policy.versioning || {}),
      enabled: Boolean(enabled),
      bump: policy.versioning?.bump || DEFAULT_BUMP,
      trigger: 'manual',
      lock_scope: 'git-common-dir',
      managed_files: policy.versioning?.managed_files || ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'],
      collision_policy: policy.versioning?.collision_policy || 'explicit_bump_only'
    }
  });
}

async function gitPaths(root) {
  const top = await git(root, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return { ok: false, reason: 'not_git' };
  const common = await git(root, ['rev-parse', '--git-common-dir']);
  const hook = await git(root, ['rev-parse', '--git-path', 'hooks/pre-commit']);
  if (common.code !== 0 || hook.code !== 0) return { ok: false, reason: 'git_paths_unavailable' };
  const topLevel = top.stdout.trim();
  const commonDir = path.resolve(topLevel, common.stdout.trim());
  const hookPath = path.resolve(topLevel, hook.stdout.trim());
  return { ok: true, top_level: topLevel, common_dir: commonDir, hook_path: hookPath };
}

async function git(root, args, opts = {}) {
  return runProcess('git', args, { cwd: root, timeoutMs: opts.timeoutMs || 15000, maxOutputBytes: opts.maxOutputBytes || 64 * 1024 });
}

async function gitJson(root, spec) {
  const result = await git(root, ['show', spec], { maxOutputBytes: 256 * 1024 });
  if (result.code !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

async function withVersionLock(commonDir, fn) {
  const lockDir = path.join(commonDir, 'sks-version.lock');
  const started = Date.now();
  let attempts = 0;
  while (true) {
    attempts += 1;
    try {
      await fsp.mkdir(lockDir);
      await writeTextAtomic(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, started_at: nowIso() }, null, 2));
      try {
        const result = await fn();
        return { ...result, lock_attempts: attempts };
      } finally {
        await fsp.rm(lockDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      if (Date.now() - started > 15000) return { ok: false, reason: 'version_lock_timeout', lock_path: lockDir };
      await sleep(150 + Math.min(750, attempts * 25));
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncPackageLockVersions(root, version) {
  const files = [];
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json']) {
    const file = path.join(root, rel);
    const json = await readJson(file, null);
    if (!json) continue;
    let changed = false;
    if (json.version && json.version !== version) { json.version = version; changed = true; }
    if (json.packages?.['']?.version && json.packages[''].version !== version) {
      json.packages[''].version = version;
      changed = true;
    }
    if (changed) {
      await writeJsonAtomic(file, json);
      files.push(file);
    }
  }
  return { files, relative_files: files.map((file) => path.relative(root, file)) };
}

async function syncSourcePackageVersion(root, version) {
  const files = [];
  for (const rel of ['src/core/fsx.mjs', 'src/core/version.mjs']) {
    const file = path.join(root, rel);
    const text = await readFileMaybe(file);
    if (!text) continue;
    const next = text.replace(/export const PACKAGE_VERSION = ['"][^'"]+['"];/, `export const PACKAGE_VERSION = '${version}';`);
    if (next === text) continue;
    await writeTextAtomic(file, next);
    files.push(file);
  }
  return { files, relative_files: files.map((file) => path.relative(root, file)) };
}

async function syncChangelogVersionSection(root, version) {
  const file = path.join(root, 'CHANGELOG.md');
  let text = await readFileMaybe(file);
  const date = nowIso().slice(0, 10);
  const sectionRe = new RegExp(`^##\\s+\\[${escapeRegExp(version)}\\]\\s+-\\s+\\d{4}-\\d{2}-\\d{2}\\s*$`, 'm');
  if (sectionRe.test(text)) return { files: [], relative_files: [] };

  if (!text.trim()) text = '# Changelog\n\n## [Unreleased]\n\n';
  if (!/^#\s+Changelog\s*$/m.test(text)) text = `# Changelog\n\n${text.replace(/^\s+/, '')}`;
  if (!/^##\s+\[Unreleased\]\s*$/m.test(text)) {
    text = text.replace(/^#\s+Changelog\s*$/m, (title) => `${title}\n\n## [Unreleased]`);
  }

  const managedSection = `\n## [${version}] - ${date}\n\n### Fixed\n\n- Keep release metadata aligned after an explicit SKS version bump advances the package version.\n`;
  const next = text.replace(/^##\s+\[Unreleased\]\s*$/m, (heading) => `${heading}\n${managedSection}`);
  if (next === text) return { files: [], relative_files: [] };
  await writeTextAtomic(file, next);
  return { files: [file], relative_files: [path.relative(root, file)] };
}

async function changelogHasVersionSection(root, version) {
  const file = path.join(root, 'CHANGELOG.md');
  const text = await readFileMaybe(file);
  const sectionRe = new RegExp(`^##\\s+\\[${escapeRegExp(version)}\\]\\s+-\\s+\\d{4}-\\d{2}-\\d{2}\\s*$`, 'm');
  return sectionRe.test(text);
}

async function stageVersionFiles(root, files) {
  const existing = [];
  for (const file of files) if (await exists(file)) existing.push(path.relative(root, file));
  if (!existing.length) return { ok: true, relative_files: [] };
  const result = await git(root, ['add', '--', ...existing]);
  return { ok: result.code === 0, relative_files: existing, stderr: result.stderr };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSemver(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function formatSemver(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function compareSemver(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if ((a?.[key] || 0) > (b?.[key] || 0)) return 1;
    if ((a?.[key] || 0) < (b?.[key] || 0)) return -1;
  }
  return 0;
}

function maxSemver(items) {
  return items.reduce((max, item) => (!max || compareSemver(item, max) > 0 ? item : max), null);
}

function bumpSemver(v, bump = DEFAULT_BUMP) {
  if (bump === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
  if (bump === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 };
  return { major: v.major, minor: v.minor, patch: v.patch + 1 };
}

function removeShellBlock(current, marker) {
  const begin = `# BEGIN ${marker}`;
  const end = `# END ${marker}`;
  const beginIdx = current.indexOf(begin);
  const endIdx = current.indexOf(end);
  if (beginIdx < 0 || endIdx < beginIdx) return current;
  return `${current.slice(0, beginIdx)}${current.slice(endIdx + end.length).replace(/^\n/, '')}`.replace(/\s*$/, '\n');
}

async function readFileMaybe(file) {
  try { return await fsp.readFile(file, 'utf8'); } catch { return ''; }
}

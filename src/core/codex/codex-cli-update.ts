import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, exists, packageRoot, readJson, runProcess, writeJsonAtomic, type RunProcessResult } from '../fsx.js';

export const CODEX_CLI_UPDATE_STATUS_SCHEMA = 'sks.codex-cli-update-status.v1';
export const CODEX_CLI_UPDATE_RESULT_SCHEMA = 'sks.codex-cli-update-result.v1';
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const CODEX_STANDALONE_INSTALLER_URL = 'https://chatgpt.com/codex/install.sh';
const CODEX_STANDALONE_INSTALLER_PS1_URL = 'https://chatgpt.com/codex/install.ps1';

export type OperatorCodexCliSource = 'explicit' | 'path' | 'unavailable';
export type CodexCliUpdateMethod = 'native-self-update' | 'standalone-installer' | 'npm-global' | 'homebrew-cask' | 'unknown';

export type OperatorCodexCliResolution = {
  ok: true;
  source: Exclude<OperatorCodexCliSource, 'unavailable'>;
  path: string;
  version: string;
  raw_version: string;
  warnings: string[];
  blockers: [];
} | {
  ok: false;
  source: 'unavailable';
  path: null;
  version: null;
  raw_version: null;
  warnings: string[];
  blockers: string[];
};

export interface CodexCliUpdateStatus {
  schema: typeof CODEX_CLI_UPDATE_STATUS_SCHEMA;
  ok: boolean;
  status: 'current' | 'update_available' | 'missing' | 'update_check_unavailable';
  installed: boolean;
  bin: string | null;
  cli_path: string | null;
  cli_source: OperatorCodexCliSource;
  current_version: string | null;
  raw_version: string | null;
  latest_version: string | null;
  update_available: boolean | null;
  update_command: 'sks codex update';
  source: 'npm' | 'cache' | 'unavailable';
  checked_at: string;
  cache_path: string;
  warnings: string[];
  blockers: string[];
  guidance: string[];
}

export interface CodexCliUpdateResult {
  schema: typeof CODEX_CLI_UPDATE_RESULT_SCHEMA;
  ok: boolean;
  status: 'updated' | 'already_current' | 'missing' | 'failed';
  command: string | null;
  update_method: CodexCliUpdateMethod;
  bin: string | null;
  cli_path: string | null;
  cli_source: OperatorCodexCliSource;
  post_update_cli_path: string | null;
  post_update_cli_source: OperatorCodexCliSource;
  before_version: string | null;
  after_version: string | null;
  raw_output: string;
  update_status: CodexCliUpdateStatus | null;
  blockers: string[];
  guidance: string[];
}

export interface CodexCliUpdateDependencies {
  /**
   * Retained only for compatibility with older test/caller dependency bags.
   * Update/status resolution deliberately never uses the generic runtime adapter,
   * because that adapter is allowed to choose Sneakoscope's bundled SDK CLI.
   */
  getCodexInfoImpl?: () => Promise<unknown>;
  whichImpl?: (command: string) => Promise<string | null>;
  runProcessImpl?: (command: string, args: string[], opts?: Record<string, unknown>) => Promise<RunProcessResult>;
  inspectCodexCliUpdateImpl?: (opts: Parameters<typeof inspectCodexCliUpdate>[0]) => Promise<CodexCliUpdateStatus | null>;
  now?: () => Date;
}

interface OperatorCodexCandidate {
  source: Exclude<OperatorCodexCliSource, 'unavailable'>;
  path: string;
}

export function codexCliUpdateCachePath(home: unknown = process.env.HOME || os.homedir()): string {
  return path.join(String(home || os.homedir()), '.sneakoscope', 'cache', 'codex-cli-update.json');
}

/**
 * Resolve the operator's Codex CLI for menu status/self-update operations.
 *
 * This is intentionally separate from resolveCodexRuntime/getCodexInfo. Runtime
 * execution may use the @openai/codex dependency bundled under Sneakoscope, but
 * self-update must never mutate that package-owned dependency. Explicit operator
 * overrides are considered first, followed by every executable on PATH; any
 * candidate owned by this Sneakoscope package is rejected and resolution continues.
 */
export async function resolveOperatorCodexCli(opts: {
  codexBin?: string;
  env?: NodeJS.ProcessEnv;
  deps?: CodexCliUpdateDependencies;
} = {}): Promise<OperatorCodexCliResolution> {
  const env = opts.env || process.env;
  const run = opts.deps?.runProcessImpl || runProcess;
  const candidates = await operatorCodexCandidates(opts.codexBin, env);
  const warnings: string[] = [];
  for (const candidate of candidates) {
    if (!await exists(candidate.path)) {
      if (candidate.source === 'explicit') warnings.push(`codex_cli_explicit_override_missing:${candidate.path}`);
      continue;
    }
    const realPath = await fsp.realpath(candidate.path).catch(() => candidate.path);
    const rejectedReason = await nonOperatorCodexReason(candidate.path, realPath);
    if (rejectedReason) {
      warnings.push(`codex_cli_${rejectedReason}_candidate_rejected:${candidate.path}`);
      continue;
    }
    const result = await run(candidate.path, ['--version'], {
      timeoutMs: 10_000,
      maxOutputBytes: 16 * 1024,
      env
    }).catch((err: unknown) => failedProcessResult(err));
    const rawVersion = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const version = result.code === 0 ? officialCodexCliVersionNumber(rawVersion) : null;
    if (!version) {
      warnings.push(`codex_cli_candidate_identity_or_version_unavailable:${candidate.path}`);
      continue;
    }
    return {
      ok: true,
      source: candidate.source,
      path: candidate.path,
      version,
      raw_version: rawVersion,
      warnings,
      blockers: []
    };
  }
  return {
    ok: false,
    source: 'unavailable',
    path: null,
    version: null,
    raw_version: null,
    warnings,
    blockers: ['operator_codex_cli_missing']
  };
}

export async function inspectCodexCliUpdate(opts: {
  home?: string;
  force?: boolean;
  cacheTtlMs?: number;
  codexBin?: string;
  env?: NodeJS.ProcessEnv;
  deps?: CodexCliUpdateDependencies;
} = {}): Promise<CodexCliUpdateStatus> {
  const deps = opts.deps || {};
  const now = deps.now ? deps.now() : new Date();
  const home = opts.home || opts.env?.HOME || process.env.HOME || os.homedir();
  const cachePath = codexCliUpdateCachePath(home);
  const codex = await resolveOperatorCodexCli({
    ...(opts.codexBin ? { codexBin: opts.codexBin } : {}),
    ...(opts.env ? { env: opts.env } : {}),
    deps
  });
  if (!codex.ok || !codex.path || !codex.version) {
    return {
      schema: CODEX_CLI_UPDATE_STATUS_SCHEMA,
      ok: false,
      status: 'missing',
      installed: false,
      bin: null,
      cli_path: null,
      cli_source: 'unavailable',
      current_version: null,
      raw_version: null,
      latest_version: null,
      update_available: null,
      update_command: 'sks codex update',
      source: 'unavailable',
      checked_at: now.toISOString(),
      cache_path: cachePath,
      warnings: codex.warnings,
      blockers: ['codex_cli_missing', ...codex.blockers],
      guidance: ['Install a release build of Codex CLI on the operator PATH, then reopen the SKS menu bar.']
    };
  }

  const ttlMs = Math.max(0, Number(opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS));
  const cached = await readJson<any>(cachePath, null).catch(() => null);
  const cachedAt = Date.parse(String(cached?.checked_at || ''));
  const cachedFresh = opts.force !== true
    && cached?.schema === CODEX_CLI_UPDATE_STATUS_SCHEMA
    && typeof cached?.latest_version === 'string'
    && Number.isFinite(cachedAt)
    && now.getTime() - cachedAt < ttlMs;
  if (cachedFresh) {
    return buildStatus({
      codex,
      latestVersion: cached.latest_version,
      source: 'cache',
      checkedAt: String(cached.checked_at),
      cachePath
    });
  }

  const env = opts.env || process.env;
  const npm = deps.whichImpl
    ? await deps.whichImpl('npm').catch(() => null)
    : await resolveOperatorExecutable('npm', env);
  if (!npm) return unavailableStatus(codex, now, cachePath, 'npm_not_found');
  const run = deps.runProcessImpl || runProcess;
  const result = await run(npm, ['view', '@openai/codex', 'version'], {
    timeoutMs: 8_000,
    maxOutputBytes: 8 * 1024,
    env: opts.env || process.env
  }).catch((err: unknown) => failedProcessResult(err));
  const latestVersion = result.code === 0
    ? codexCliVersionNumber(String(result.stdout || '').trim().split(/\s+/).pop() || '')
    : null;
  if (!latestVersion) {
    return unavailableStatus(
      codex,
      now,
      cachePath,
      String(result.stderr || result.stdout || 'codex_cli_latest_version_unavailable').trim()
    );
  }
  const status = buildStatus({
    codex,
    latestVersion,
    source: 'npm',
    checkedAt: now.toISOString(),
    cachePath
  });
  await ensureDir(path.dirname(cachePath));
  await writeJsonAtomic(cachePath, status).catch(() => null);
  return status;
}

export async function updateCodexCliNow(opts: {
  home?: string;
  codexBin?: string;
  env?: NodeJS.ProcessEnv;
  deps?: CodexCliUpdateDependencies;
} = {}): Promise<CodexCliUpdateResult> {
  const deps = opts.deps || {};
  const before = await resolveOperatorCodexCli({
    ...(opts.codexBin ? { codexBin: opts.codexBin } : {}),
    ...(opts.env ? { env: opts.env } : {}),
    deps
  });
  if (!before.ok || !before.path || !before.version) {
    return updateResult({
      ok: false,
      status: 'missing',
      before,
      after: null,
      rawOutput: '',
      updateStatus: null,
      command: null,
      updateMethod: 'unknown',
      blockers: ['codex_cli_missing', ...before.blockers],
      guidance: ['Install a release build of Codex CLI on the operator PATH first; SKS does not invent a package-manager fallback.']
    });
  }
  const env = opts.env || process.env;
  const run = deps.runProcessImpl || runProcess;
  const capability = await run(before.path, ['update', '--help'], {
    timeoutMs: 10_000,
    maxOutputBytes: 32 * 1024,
    env
  }).catch((err: unknown) => failedProcessResult(err));
  const capabilityOutput = `${capability.stdout || ''}${capability.stderr || ''}`.trim();
  const nativeSelfUpdateSupported = capability.code === 0
    && /Usage:\s+codex\s+update\b/i.test(capabilityOutput);
  const updatePlan = nativeSelfUpdateSupported
    ? {
        method: 'native-self-update' as const,
        command: 'codex update',
        executable: before.path,
        args: ['update']
      }
    : await detectCodexCliUpdatePlan({ before, env, deps, run });
  if (!updatePlan) {
    return updateResult({
      ok: false,
      status: 'failed',
      before,
      after: null,
      rawOutput: capabilityOutput,
      updateStatus: null,
      command: null,
      updateMethod: 'unknown',
      blockers: ['codex_cli_update_method_unverified'],
      guidance: [
        'The selected Codex CLI neither advertises native self-update nor maps safely to the official standalone installer, npm global package, or Homebrew cask.',
        'Reinstall Codex with an official supported method, then retry.'
      ]
    });
  }
  const result = updatePlan.method === 'standalone-installer'
    ? await runStandaloneInstallerUpdate({ before, env, deps, run })
    : await run(updatePlan.executable, updatePlan.args, {
        timeoutMs: 180_000,
        maxOutputBytes: 128 * 1024,
        env
      }).catch((err: unknown) => failedProcessResult(err));
  const rawOutput = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.code !== 0) {
    return updateResult({
      ok: false,
      status: 'failed',
      before,
      after: null,
      rawOutput,
      updateStatus: null,
      command: updatePlan.command,
      updateMethod: updatePlan.method,
      blockers: [updateFailureBlocker(updatePlan.method)],
      guidance: [`Run the detected updater in a terminal to review its output: ${updatePlan.command}`]
    });
  }

  const after = await resolveOperatorCodexCli({
    ...(opts.codexBin ? { codexBin: opts.codexBin } : {}),
    ...(opts.env ? { env: opts.env } : {}),
    deps
  });
  if (!after.ok || !after.path || !after.version) {
    return updateResult({
      ok: false,
      status: 'failed',
      before,
      after,
      rawOutput,
      updateStatus: null,
      command: updatePlan.command,
      updateMethod: updatePlan.method,
      blockers: ['codex_cli_post_update_missing', ...after.blockers],
      guidance: ['The updater exited successfully, but the operator Codex CLI or its version disappeared. Reinstall Codex CLI and retry the status check.']
    });
  }
  if (after.path !== before.path) {
    return updateResult({
      ok: false,
      status: 'failed',
      before,
      after,
      rawOutput,
      updateStatus: null,
      command: updatePlan.command,
      updateMethod: updatePlan.method,
      blockers: ['codex_cli_post_update_target_changed'],
      guidance: ['The updated Codex CLI path disappeared and resolution fell through to a different installation. Restore or reinstall the original operator CLI before retrying.']
    });
  }
  const versionComparison = compareCodexCliVersions(after.version, before.version);
  if (versionComparison < 0) {
    return updateResult({
      ok: false,
      status: 'failed',
      before,
      after,
      rawOutput,
      updateStatus: null,
      command: updatePlan.command,
      updateMethod: updatePlan.method,
      blockers: ['codex_cli_post_update_version_regressed'],
      guidance: ['The Codex updater returned an older operator CLI version. Restore or reinstall the expected release before retrying.']
    });
  }

  const inspect = deps.inspectCodexCliUpdateImpl || inspectCodexCliUpdate;
  const updateStatus = await inspect({
    ...(opts.home ? { home: opts.home } : {}),
    force: true,
    ...(opts.codexBin ? { codexBin: opts.codexBin } : {}),
    ...(opts.env ? { env: opts.env } : {}),
    deps
  }).catch(() => null);
  const statusName = String(updateStatus?.status || 'missing');
  const statusTrusted = updateStatus?.ok === true
    && updateStatus.installed === true
    && Boolean(updateStatus.cli_path)
    && Boolean(updateStatus.current_version)
    && statusName !== 'missing'
    && statusName !== 'failed';
  if (!statusTrusted) {
    return updateResult({
      ok: false,
      status: 'failed',
      before,
      after,
      rawOutput,
      updateStatus,
      command: updatePlan.command,
      updateMethod: updatePlan.method,
      blockers: ['codex_cli_post_update_status_untrusted'],
      guidance: ['The updater exited successfully, but the refreshed operator CLI status was missing or failed. Verify `codex --version` before retrying.']
    });
  }
  if (updateStatus.cli_path !== after.path || updateStatus.current_version !== after.version) {
    return updateResult({
      ok: false,
      status: 'failed',
      before,
      after,
      rawOutput,
      updateStatus,
      command: updatePlan.command,
      updateMethod: updatePlan.method,
      blockers: ['codex_cli_post_update_status_target_mismatch'],
      guidance: ['The refreshed status described a different Codex CLI path or version. Fix PATH/override precedence before retrying the update.']
    });
  }

  return updateResult({
    ok: true,
    status: versionComparison > 0 ? 'updated' : 'already_current',
    before,
    after,
    rawOutput,
    updateStatus,
    command: updatePlan.command,
    updateMethod: updatePlan.method,
    blockers: [],
    guidance: updateStatus.update_available === true
      ? [`The updater completed, but a newer registry version is still reported. Reopen the menu or rerun: ${updatePlan.command}`]
      : []
  });
}

export function codexCliVersionNumber(value: unknown): string | null {
  const match = String(value || '').match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  return match?.[1] || null;
}

export function officialCodexCliVersionNumber(value: unknown): string | null {
  const firstLine = String(value || '').trim().split(/\r?\n/).find((line) => line.trim())?.trim() || '';
  if (!/^codex-cli\s+\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\s*$/i.test(firstLine)) return null;
  return codexCliVersionNumber(firstLine);
}

export function compareCodexCliVersions(left: unknown, right: unknown): number {
  const a = codexCliVersionNumber(left);
  const b = codexCliVersionNumber(right);
  if (!a || !b) return 0;
  const [aCore = '', aPre = ''] = a.split('-', 2);
  const [bCore = '', bPre = ''] = b.split('-', 2);
  const aParts = aCore.split('.').map(Number);
  const bParts = bCore.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (aParts[index] || 0) - (bParts[index] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  if (!aPre && !bPre) return 0;
  if (!aPre) return 1;
  if (!bPre) return -1;
  return aPre.localeCompare(bPre, undefined, { numeric: true });
}

interface CodexCliUpdatePlan {
  method: Exclude<CodexCliUpdateMethod, 'unknown'>;
  command: string;
  executable: string;
  args: string[];
}

async function detectCodexCliUpdatePlan(input: {
  before: OperatorCodexCliResolution & { ok: true; path: string; version: string };
  env: NodeJS.ProcessEnv;
  deps: CodexCliUpdateDependencies;
  run: NonNullable<CodexCliUpdateDependencies['runProcessImpl']>;
}): Promise<CodexCliUpdatePlan | null> {
  const selectedPath = path.resolve(input.before.path);
  const selectedRealPath = await realPathOrResolved(selectedPath);
  const codexHome = await realPathOrResolved(input.env.CODEX_HOME || path.join(input.env.HOME || os.homedir(), '.codex'));
  const standaloneRoot = await realPathOrResolved(path.join(codexHome, 'packages', 'standalone'));
  if (isWithin(selectedRealPath, standaloneRoot)) {
    return {
      method: 'standalone-installer',
      command: process.platform === 'win32'
        ? `powershell -NoProfile -Command "irm ${CODEX_STANDALONE_INSTALLER_PS1_URL} | iex"`
        : `curl -fsSL ${CODEX_STANDALONE_INSTALLER_URL} | CODEX_NON_INTERACTIVE=1 sh`,
      executable: '',
      args: []
    };
  }

  const brew = await resolveUpdateExecutable('brew', input.env, input.deps);
  if (brew) {
    const caskPrefixResult = await input.run(brew, ['--prefix', '--cask', 'codex'], {
      timeoutMs: 10_000,
      maxOutputBytes: 16 * 1024,
      env: input.env
    }).catch((err: unknown) => failedProcessResult(err));
    const caskPrefix = caskPrefixResult.code === 0
      ? String(caskPrefixResult.stdout || '').trim().split(/\r?\n/).find(Boolean) || ''
      : '';
    if (caskPrefix && isWithin(selectedRealPath, await realPathOrResolved(caskPrefix))) {
      return {
        method: 'homebrew-cask',
        command: 'brew upgrade --cask codex',
        executable: brew,
        args: ['upgrade', '--cask', 'codex']
      };
    }
  }

  const npm = await resolveUpdateExecutable('npm', input.env, input.deps);
  if (npm) {
    const [rootResult, prefixResult] = await Promise.all([
      input.run(npm, ['root', '-g'], {
        timeoutMs: 10_000,
        maxOutputBytes: 16 * 1024,
        env: input.env
      }).catch((err: unknown) => failedProcessResult(err)),
      input.run(npm, ['prefix', '-g'], {
        timeoutMs: 10_000,
        maxOutputBytes: 16 * 1024,
        env: input.env
      }).catch((err: unknown) => failedProcessResult(err))
    ]);
    const npmRoot = rootResult.code === 0
      ? String(rootResult.stdout || '').trim().split(/\r?\n/).find(Boolean) || ''
      : '';
    const npmPrefix = prefixResult.code === 0
      ? String(prefixResult.stdout || '').trim().split(/\r?\n/).find(Boolean) || ''
      : '';
    const packageDir = npmRoot ? await realPathOrResolved(path.resolve(npmRoot, '@openai', 'codex')) : '';
    const npmBinCandidates = npmPrefix
      ? process.platform === 'win32'
        ? ['codex.cmd', 'codex.exe', 'codex'].map((name) => path.resolve(npmPrefix, name))
        : [path.resolve(npmPrefix, 'bin', 'codex')]
      : [];
    const packageInstalled = Boolean(packageDir) && await exists(packageDir);
    if (packageInstalled && (
      isWithin(selectedRealPath, packageDir)
      || npmBinCandidates.includes(selectedPath)
    )) {
      return {
        method: 'npm-global',
        command: 'npm install -g @openai/codex@latest',
        executable: npm,
        args: ['install', '-g', '@openai/codex@latest']
      };
    }
  }
  return null;
}

async function runStandaloneInstallerUpdate(input: {
  before: OperatorCodexCliResolution & { ok: true; path: string; version: string };
  env: NodeJS.ProcessEnv;
  deps: CodexCliUpdateDependencies;
  run: NonNullable<CodexCliUpdateDependencies['runProcessImpl']>;
}): Promise<RunProcessResult> {
  if (process.platform === 'win32') {
    const powershell = await resolveUpdateExecutable('pwsh', input.env, input.deps)
      || await resolveUpdateExecutable('powershell', input.env, input.deps);
    if (!powershell) return failedProcessResult(new Error('codex_cli_standalone_update_prerequisite_missing'));
    const codexHome = path.resolve(input.env.CODEX_HOME || path.join(input.env.HOME || os.homedir(), '.codex'));
    return input.run(powershell, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `$ErrorActionPreference='Stop'; Invoke-RestMethod '${CODEX_STANDALONE_INSTALLER_PS1_URL}' | Invoke-Expression`
    ], {
      timeoutMs: 180_000,
      maxOutputBytes: 128 * 1024,
      env: {
        ...input.env,
        CODEX_HOME: codexHome,
        CODEX_INSTALL_DIR: path.dirname(input.before.path),
        CODEX_NON_INTERACTIVE: '1'
      }
    }).catch((err: unknown) => failedProcessResult(err));
  }
  const curl = await resolveUpdateExecutable('curl', input.env, input.deps);
  const shell = await resolveUpdateExecutable('sh', input.env, input.deps);
  if (!curl || !shell) {
    return failedProcessResult(new Error('codex_cli_standalone_update_prerequisite_missing'));
  }
  const download = await input.run(curl, ['-fsSL', CODEX_STANDALONE_INSTALLER_URL], {
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024,
    env: input.env
  }).catch((err: unknown) => failedProcessResult(err));
  const installer = String(download.stdout || '');
  if (download.code !== 0 || !/^#!\/bin\/sh\s*$/m.test(installer) || !installer.includes('CODEX_NON_INTERACTIVE')) {
    return {
      ...download,
      code: download.code === 0 ? 1 : download.code,
      stderr: String(download.stderr || 'codex_cli_standalone_installer_download_untrusted')
    };
  }
  const codexHome = path.resolve(input.env.CODEX_HOME || path.join(input.env.HOME || os.homedir(), '.codex'));
  return input.run(shell, ['-s', '--'], {
    timeoutMs: 180_000,
    maxOutputBytes: 128 * 1024,
    input: installer,
    env: {
      ...input.env,
      CODEX_HOME: codexHome,
      CODEX_INSTALL_DIR: path.dirname(input.before.path),
      CODEX_NON_INTERACTIVE: '1'
    }
  }).catch((err: unknown) => failedProcessResult(err));
}

async function resolveUpdateExecutable(
  command: string,
  env: NodeJS.ProcessEnv,
  deps: CodexCliUpdateDependencies
): Promise<string | null> {
  return deps.whichImpl
    ? deps.whichImpl(command).catch(() => null)
    : resolveOperatorExecutable(command, env);
}

function updateFailureBlocker(method: Exclude<CodexCliUpdateMethod, 'unknown'>): string {
  if (method === 'native-self-update') return 'codex_cli_self_update_failed';
  if (method === 'standalone-installer') return 'codex_cli_standalone_update_failed';
  if (method === 'homebrew-cask') return 'codex_cli_homebrew_cask_update_failed';
  return 'codex_cli_npm_global_update_failed';
}

async function realPathOrResolved(value: string): Promise<string> {
  const resolved = path.resolve(value);
  return fsp.realpath(resolved).catch(() => resolved);
}

async function operatorCodexCandidates(explicitBin: string | undefined, env: NodeJS.ProcessEnv): Promise<OperatorCodexCandidate[]> {
  const candidates: OperatorCodexCandidate[] = [];
  const seen = new Set<string>();
  const add = (source: OperatorCodexCandidate['source'], candidate: unknown) => {
    const value = String(candidate || '').trim();
    if (!value) return;
    const normalized = path.resolve(value);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({ source, path: normalized });
  };
  const explicitValues = [
    explicitBin,
    env.SKS_CODEX_UPDATE_BIN,
    env.SKS_CODEX_BIN,
    env.CODEX_BIN,
    env.DCODEX_CODEX_BIN
  ];
  for (const value of explicitValues) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    if (path.isAbsolute(raw) || raw.includes('/') || raw.includes('\\')) {
      add('explicit', raw);
    } else {
      const matches = executablePathsOnPath(raw, env);
      if (matches.length) for (const match of matches) add('explicit', match);
      else add('explicit', raw);
    }
  }
  for (const match of executablePathsOnPath('codex', env)) add('path', match);
  for (const match of await homeOperatorExecutablePaths('codex', env)) add('path', match);
  return candidates;
}

async function resolveOperatorExecutable(command: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const candidates = [
    ...executablePathsOnPath(command, env),
    ...await homeOperatorExecutablePaths(command, env)
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function homeOperatorExecutablePaths(command: string, env: NodeJS.ProcessEnv): Promise<string[]> {
  const home = path.resolve(env.HOME || os.homedir());
  const names = process.platform === 'win32'
    ? executableNamesForWindows(command, env.PATHEXT)
    : [command];
  const dirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, 'Library', 'pnpm'),
    path.join(home, '.local', 'share', 'pnpm')
  ];
  const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');
  const nvmVersions = await fsp.readdir(nvmVersionsDir, { withFileTypes: true })
    .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(compareNodeInstallNames).reverse())
    .catch(() => [] as string[]);
  dirs.unshift(...nvmVersions.map((version) => path.join(nvmVersionsDir, version, 'bin')));
  return dirs.flatMap((dir) => names.map((name) => path.join(dir, name)));
}

function compareNodeInstallNames(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/i, '').split('.').map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return delta;
  }
  return left.localeCompare(right);
}

function executablePathsOnPath(command: string, env: NodeJS.ProcessEnv): string[] {
  const names = process.platform === 'win32'
    ? executableNamesForWindows(command, env.PATHEXT)
    : [command];
  const matches: string[] = [];
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) matches.push(path.join(dir, name));
  }
  return matches;
}

function executableNamesForWindows(command: string, pathExt: string | undefined): string[] {
  if (path.extname(command)) return [command];
  const extensions = String(pathExt || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
}

async function nonOperatorCodexReason(candidatePath: string, realPath: string): Promise<'sneakoscope_bundled' | 'project_local' | null> {
  const root = packageRoot();
  const ownedRoots = [
    path.join(root, 'node_modules'),
    path.join(root, 'dist', 'vendor', 'openai-codex'),
    path.join(root, 'vendor', 'openai-codex')
  ];
  if (ownedRoots.some((ownedRoot) => isWithin(candidatePath, ownedRoot) || isWithin(realPath, ownedRoot))) {
    return 'sneakoscope_bundled';
  }
  const normalizedPaths = [candidatePath, realPath].map((value) => path.resolve(value).replaceAll('\\', '/'));
  if (normalizedPaths.some((value) => /(?:^|\/)node_modules\/sneakoscope(?:\/|$)/.test(value))) {
    return 'sneakoscope_bundled';
  }
  for (const value of normalizedPaths) {
    if (/(?:^|\/)node_modules\/\.bin(?:\/|$)/.test(value)) return 'project_local';
    const marker = '/node_modules/';
    const index = value.indexOf(marker);
    if (index <= 0) continue;
    const ownerRoot = value.slice(0, index);
    if (await exists(path.join(ownerRoot, 'package.json'))) return 'project_local';
  }
  return null;
}

function isWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function buildStatus(input: {
  codex: OperatorCodexCliResolution & { ok: true; path: string; version: string };
  latestVersion: string;
  source: 'npm' | 'cache';
  checkedAt: string;
  cachePath: string;
}): CodexCliUpdateStatus {
  const updateAvailable = compareCodexCliVersions(input.latestVersion, input.codex.version) > 0;
  return {
    schema: CODEX_CLI_UPDATE_STATUS_SCHEMA,
    ok: true,
    status: updateAvailable ? 'update_available' : 'current',
    installed: true,
    bin: input.codex.path,
    cli_path: input.codex.path,
    cli_source: input.codex.source,
    current_version: input.codex.version,
    raw_version: input.codex.raw_version,
    latest_version: input.latestVersion,
    update_available: updateAvailable,
    update_command: 'sks codex update',
    source: input.source,
    checked_at: input.checkedAt,
    cache_path: input.cachePath,
    warnings: input.codex.warnings,
    blockers: [],
    guidance: updateAvailable ? ['Run `sks codex update` or choose Update Codex CLI Now in the SKS menu bar.'] : []
  };
}

function unavailableStatus(
  codex: OperatorCodexCliResolution & { ok: true; path: string; version: string },
  now: Date,
  cachePath: string,
  warning: string
): CodexCliUpdateStatus {
  return {
    schema: CODEX_CLI_UPDATE_STATUS_SCHEMA,
    ok: true,
    status: 'update_check_unavailable',
    installed: true,
    bin: codex.path,
    cli_path: codex.path,
    cli_source: codex.source,
    current_version: codex.version,
    raw_version: codex.raw_version,
    latest_version: null,
    update_available: null,
    update_command: 'sks codex update',
    source: 'unavailable',
    checked_at: now.toISOString(),
    cache_path: cachePath,
    warnings: [...codex.warnings, warning],
    blockers: [],
    guidance: ['Current Codex CLI version is shown, but the latest-version check could not be completed.']
  };
}

function updateResult(input: {
  ok: boolean;
  status: CodexCliUpdateResult['status'];
  before: OperatorCodexCliResolution;
  after: OperatorCodexCliResolution | null;
  rawOutput: string;
  updateStatus: CodexCliUpdateStatus | null;
  command: string | null;
  updateMethod: CodexCliUpdateMethod;
  blockers: string[];
  guidance: string[];
}): CodexCliUpdateResult {
  return {
    schema: CODEX_CLI_UPDATE_RESULT_SCHEMA,
    ok: input.ok,
    status: input.status,
    command: input.command,
    update_method: input.updateMethod,
    bin: input.before.path,
    cli_path: input.before.path,
    cli_source: input.before.source,
    post_update_cli_path: input.after?.path || null,
    post_update_cli_source: input.after?.source || 'unavailable',
    before_version: input.before.version,
    after_version: input.after?.version || null,
    raw_output: input.rawOutput,
    update_status: input.updateStatus,
    blockers: input.blockers,
    guidance: input.guidance
  };
}

function failedProcessResult(err: unknown): RunProcessResult {
  return {
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err),
    stdoutBytes: 0,
    stderrBytes: 0,
    truncated: false,
    timedOut: false
  };
}

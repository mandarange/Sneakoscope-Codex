import os from 'node:os';
import path from 'node:path';
import { PACKAGE_VERSION, packageRoot, readJson, runProcess, which } from './fsx.js';
import { createRequestedScopeContract } from './safety/requested-scope-contract.js';
import { guardedPackageInstall, guardContextForRoute } from './safety/mutation-guard.js';
import {
  isUpdateMigrationReceiptCurrent,
  resolveInstalledSksEntrypoint,
  runPackageLocalDoctor,
  type PackageLocalDoctorRun,
  type UpdateMigrationReceipt,
  writeProjectUpdateMigrationReceipt
} from './update/update-migration-state.js';

export interface SksUpdateCheckOptions {
  packageName?: string;
  currentVersion?: string;
  registry?: string;
  npmBin?: string | null;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface SksVersionCandidate {
  version: string;
  source: string;
}

export interface SksEffectiveVersionResult {
  current: string;
  runtime_current: string;
  package_root_current: string | null;
  path_current: string | null;
  npm_global_current: string | null;
  candidates: SksVersionCandidate[];
  errors: string[];
}

export interface SksUpdateCheckResult {
  schema: 'sks.update-check.v2';
  package: string;
  current: string;
  runtime_current: string;
  package_root_current: string | null;
  path_current: string | null;
  npm_global_current: string | null;
  version_candidates: SksVersionCandidate[];
  latest: string | null;
  update_available: boolean;
  status: 'current' | 'available' | 'unavailable';
  mode: 'function';
  route_required: false;
  pipeline_required: false;
  command: string | null;
  npm_bin: string | null;
  registry: string;
  error: string | null;
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

export interface SksUpdateNowOptions extends SksUpdateCheckOptions {
  version?: string | null;
  dryRun?: boolean;
  projectRoot?: string | null;
}

export interface SksUpdateNowStage {
  id: string;
  ok: boolean;
  status: string;
  detail?: Record<string, unknown>;
}

export interface SksUpdateNowResult {
  schema: 'sks.update-now.v2';
  ok: boolean;
  status: 'updated' | 'current' | 'dry_run' | 'unavailable' | 'failed';
  package: string;
  from: string;
  latest: string | null;
  requested_version: string | null;
  install_version: string | null;
  npm_bin: string | null;
  npm_args: string[];
  command: string | null;
  cwd: string;
  registry: string;
  global_root: string | null;
  install_code: number | null;
  old_version_doctor: PackageLocalDoctorRun | null;
  new_binary: string | null;
  new_version: string | null;
  new_version_doctor: PackageLocalDoctorRun | null;
  project_receipt: UpdateMigrationReceipt | null;
  migration_current: boolean;
  stages: SksUpdateNowStage[];
  error: string | null;
}

export async function runSksUpdateCheck(options: SksUpdateCheckOptions = {}): Promise<SksUpdateCheckResult> {
  const packageName = options.packageName || 'sneakoscope';
  const registry = options.registry || DEFAULT_REGISTRY;
  const env = options.env || process.env;
  const npmBin = options.npmBin === undefined ? await which('npm') : options.npmBin;
  const effectiveOptions: SksUpdateCheckOptions = {
    packageName,
    currentVersion: options.currentVersion || PACKAGE_VERSION,
    npmBin,
    env
  };
  if (options.timeoutMs !== undefined) effectiveOptions.timeoutMs = options.timeoutMs;
  if (options.maxOutputBytes !== undefined) effectiveOptions.maxOutputBytes = options.maxOutputBytes;
  const override = env[versionOverrideEnvName(packageName)];
  const effectivePromise = detectEffectiveSksVersion(effectiveOptions);
  const latestPromise = !override && npmBin
    ? runProcess(npmBin, ['view', packageName, 'version', '--silent', '--registry', registry], {
      env,
      timeoutMs: options.timeoutMs ?? 5000,
      maxOutputBytes: options.maxOutputBytes ?? 4096
    }).catch((err: unknown) => ({
      code: 1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err)
    }))
    : Promise.resolve(null);
  const effective = await effectivePromise;
  const current = effective.current;
  if (override) return buildResult({ packageName, current, effective, latest: override, registry, npmBin });

  if (!npmBin) {
    return buildResult({
      packageName,
      current,
      effective,
      latest: null,
      registry,
      npmBin: null,
      error: 'npm not found on PATH'
    });
  }

  const result = await latestPromise;
  if (!result) {
    return buildResult({
      packageName,
      current,
      effective,
      latest: null,
      registry,
      npmBin,
      error: 'npm view failed'
    });
  }
  if (result.code !== 0) {
    return buildResult({
      packageName,
      current,
      effective,
      latest: null,
      registry,
      npmBin,
      error: `${result.stderr || result.stdout || 'npm view failed'}`.trim()
    });
  }
  return buildResult({
    packageName,
    current,
    effective,
    latest: String(result.stdout || '').trim().split(/\s+/).pop() || null,
    registry,
    npmBin
  });
}

export async function runSksUpdateNow(options: SksUpdateNowOptions = {}): Promise<SksUpdateNowResult> {
  const packageName = options.packageName || 'sneakoscope';
  const registry = options.registry || DEFAULT_REGISTRY;
  const env = options.env || process.env;
  const npmBin = options.npmBin === undefined ? await which('npm') : options.npmBin;
  const cwd = os.homedir();
  const check = await runSksUpdateCheck({
    ...options,
    packageName,
    registry,
    npmBin,
    env
  });
  const requestedVersion = parseVersionText(options.version || '') || null;
  const installVersion = requestedVersion || check.latest;
  const npmArgs = installVersion ? sksGlobalInstallArgs(packageName, installVersion, registry) : [];
  const command = npmBin && npmArgs.length ? [npmBin, ...npmArgs].join(' ') : null;
  const globalRoot = npmBin ? await detectNpmGlobalRoot(npmBin, env, options).catch(() => null) : null;
  const projectReceiptRoot = path.resolve(options.projectRoot || env.SKS_MUTATION_LEDGER_ROOT || process.cwd());
  const stages: SksUpdateNowStage[] = [];
  const stage = (id: string, ok: boolean, status: string, detail: Record<string, unknown> = {}) => {
    stages.push({ id, ok, status, detail });
  };

  if (!npmBin) {
    return buildUpdateNowResult({
      packageName,
      from: check.current,
      latest: check.latest,
      requestedVersion,
      installVersion,
      npmBin: null,
      npmArgs,
      command,
      cwd,
      registry,
      globalRoot,
      status: 'unavailable',
      ok: false,
      installCode: null,
      oldVersionDoctor: null,
      newBinary: null,
      newVersion: null,
      newVersionDoctor: null,
      projectReceipt: null,
      migrationCurrent: false,
      stages,
      error: 'npm not found on PATH'
    });
  }
  if (!installVersion) {
    return buildUpdateNowResult({
      packageName,
      from: check.current,
      latest: check.latest,
      requestedVersion,
      installVersion,
      npmBin,
      npmArgs,
      command,
      cwd,
      registry,
      globalRoot,
      status: 'unavailable',
      ok: false,
      installCode: null,
      oldVersionDoctor: null,
      newBinary: null,
      newVersion: null,
      newVersionDoctor: null,
      projectReceipt: null,
      migrationCurrent: false,
      stages,
      error: check.error || 'latest version unavailable'
    });
  }
  if (!requestedVersion && check.latest && !check.update_available) {
    const receipt = await writeProjectUpdateMigrationReceipt({
      root: projectReceiptRoot,
      source: 'update-now-current',
      blockers: [],
      warnings: ['package_already_current']
    }).catch(() => null);
    const migrationCurrent = isUpdateMigrationReceiptCurrent(receipt);
    stage('project_receipt', migrationCurrent, migrationCurrent ? 'current' : 'failed', { root: projectReceiptRoot });
    return buildUpdateNowResult({
      packageName,
      from: check.current,
      latest: check.latest,
      requestedVersion,
      installVersion,
      npmBin,
      npmArgs,
      command,
      cwd,
      registry,
      globalRoot,
      status: 'current',
      ok: migrationCurrent,
      installCode: null,
      oldVersionDoctor: null,
      newBinary: null,
      newVersion: check.current,
      newVersionDoctor: null,
      projectReceipt: receipt,
      migrationCurrent,
      stages,
      error: null
    });
  }
  const oldVersionDoctor = await runPackageLocalDoctor({
    root: projectReceiptRoot,
    args: ['doctor', '--fix', '--yes', '--profile', 'migration', '--machine-only', '--report-file', path.join(projectReceiptRoot, '.sneakoscope', 'update', `old-version-doctor-${Date.now()}.json`)],
    env,
    timeoutMs: 15_000,
    maxOutputBytes: 32 * 1024
  });
  stage('old_version_doctor_preflight', oldVersionDoctor.ok, oldVersionDoctor.status, { entrypoint: oldVersionDoctor.entrypoint, exit_code: oldVersionDoctor.exit_code });
  if (!oldVersionDoctor.ok && env.SKS_UPDATE_SKIP_OLD_DOCTOR_PREFLIGHT !== '1') {
    return buildUpdateNowResult({
      packageName,
      from: check.current,
      latest: check.latest,
      requestedVersion,
      installVersion,
      npmBin,
      npmArgs,
      command,
      cwd,
      registry,
      globalRoot,
      status: 'failed',
      ok: false,
      installCode: null,
      oldVersionDoctor,
      newBinary: null,
      newVersion: null,
      newVersionDoctor: null,
      projectReceipt: null,
      migrationCurrent: false,
      stages,
      error: oldVersionDoctor.error || 'old-version Doctor preflight failed'
    });
  }
  if (options.dryRun) {
    stage('npm_install', true, 'dry_run', { command });
    return buildUpdateNowResult({
      packageName,
      from: check.current,
      latest: check.latest,
      requestedVersion,
      installVersion,
      npmBin,
      npmArgs,
      command,
      cwd,
      registry,
      globalRoot,
      status: 'dry_run',
      ok: true,
      installCode: null,
      oldVersionDoctor,
      newBinary: null,
      newVersion: null,
      newVersionDoctor: null,
      projectReceipt: null,
      migrationCurrent: false,
      stages,
      error: null
    });
  }

  const mutationLedgerRoot = env.SKS_MUTATION_LEDGER_ROOT || packageRoot();
  const installContract = createRequestedScopeContract({
    route: 'update',
    userRequest: command || `npm global install ${packageName}`,
    projectRoot: mutationLedgerRoot,
    overrides: { package_install: true }
  });
  const install = await guardedPackageInstall(
    guardContextForRoute(mutationLedgerRoot, installContract, command || `npm global install ${packageName}`),
    `${packageName}@${installVersion}`,
    {
      confirmed: true,
      command: npmBin,
      args: npmArgs,
      cwd,
      env,
      timeoutMs: options.timeoutMs ?? 10 * 60 * 1000,
      maxOutputBytes: options.maxOutputBytes ?? 128 * 1024
    }
  ).catch((err: unknown) => ({
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err)
  }));
  const installOk = install.code === 0;
  stage('npm_global_install', installOk, installOk ? 'installed' : 'failed', { command, code: install.code });
  let newBinary: string | null = null;
  let newVersion: string | null = null;
  let newVersionDoctor: PackageLocalDoctorRun | null = null;
  let projectReceipt: UpdateMigrationReceipt | null = null;
  let migrationCurrent = false;
  if (installOk) {
    newBinary = await resolveInstalledSksEntrypoint({ packageName, globalRoot, env });
    stage('resolve_new_package_local_binary', Boolean(newBinary), newBinary ? 'resolved' : 'missing', { new_binary: newBinary });
    if (newBinary) {
      const versionProbe = await runProcess(process.execPath, [newBinary, '--version'], {
        cwd,
        env: { ...env, SKS_UPDATE_MIGRATION_GATE_DISABLED: '1', SKS_DISABLE_UPDATE_CHECK: '1' },
        timeoutMs: 5000,
        maxOutputBytes: 4096
      }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
      newVersion = parseVersionText(versionProbe.stdout || versionProbe.stderr || '') || null;
      stage('new_version_probe', Boolean(newVersion), newVersion ? 'version_detected' : 'failed', { new_version: newVersion, code: versionProbe.code });
      newVersionDoctor = await runPackageLocalDoctor({
        root: globalSksRootPath(),
        entrypoint: newBinary,
        args: ['doctor', '--fix', '--yes', '--profile', 'migration', '--machine-only', '--report-file', path.join(globalSksRootPath(), 'update', `new-version-doctor-${Date.now()}.json`)],
        env,
        timeoutMs: 15_000,
        maxOutputBytes: 32 * 1024
      });
      stage('new_version_global_doctor', newVersionDoctor.ok, newVersionDoctor.status, { entrypoint: newBinary, exit_code: newVersionDoctor.exit_code });
    }
    if (newVersionDoctor?.ok) {
      projectReceipt = await writeProjectUpdateMigrationReceipt({
        root: projectReceiptRoot,
        source: 'update-now',
        doctor: newVersionDoctor,
        updateStages: stages,
        blockers: [],
        warnings: []
      }).catch(() => null);
      migrationCurrent = isUpdateMigrationReceiptCurrent(projectReceipt);
      stage('project_receipt', migrationCurrent, migrationCurrent ? 'current' : 'failed', { root: projectReceiptRoot });
    }
  }
  const ok = installOk && Boolean(newBinary) && newVersionDoctor?.ok === true && migrationCurrent;
  return buildUpdateNowResult({
    packageName,
    from: check.current,
    latest: check.latest,
    requestedVersion,
    installVersion,
    npmBin,
    npmArgs,
    command,
    cwd,
    registry,
    globalRoot,
    status: ok ? 'updated' : 'failed',
    ok,
    installCode: install.code,
    oldVersionDoctor,
    newBinary,
    newVersion,
    newVersionDoctor,
    projectReceipt,
    migrationCurrent,
    stages,
    error: ok ? null : updateNowError(install, newBinary, newVersionDoctor, migrationCurrent)
  });
}

export function sksGlobalInstallArgs(packageName: string, version: string, registry = DEFAULT_REGISTRY): string[] {
  return ['install', '--global', `${packageName}@${version}`, '--registry', registry];
}

export async function detectEffectiveSksVersion(options: SksUpdateCheckOptions = {}): Promise<SksEffectiveVersionResult> {
  const packageName = options.packageName || 'sneakoscope';
  const env = options.env || process.env;
  const npmBin = options.npmBin === undefined ? await which('npm') : options.npmBin;
  const candidates: SksVersionCandidate[] = [];
  const errors: string[] = [];
  const add = (version: string | null | undefined, source: string) => {
    const parsed = parseVersionText(version || '');
    if (parsed) candidates.push({ version: parsed, source });
  };
  add(options.currentVersion || PACKAGE_VERSION, 'runtime');
  add(env.SKS_INSTALLED_SKS_VERSION, 'env:SKS_INSTALLED_SKS_VERSION');
  const packageRootPromise = readJson<any>(path.join(packageRoot(), 'package.json'), {}).catch(() => ({}));
  const pathSksPromise = which('sks')
    .then(async (sks) => {
      if (!sks) return null;
      const result = await runProcess(sks, ['--version'], {
        timeoutMs: 2000,
        maxOutputBytes: 4096,
        env: { ...env, SKS_DISABLE_UPDATE_CHECK: '1' }
      }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
      return { sks, result };
    })
    .catch(() => null);
  const npmGlobalPromise = npmBin
    ? detectNpmGlobalPackageVersion(npmBin, packageName, env, {
      timeoutMs: options.timeoutMs ?? 2500,
      maxOutputBytes: options.maxOutputBytes ?? 8192
    }).catch((err: any) => ({ version: null, error: err?.message || String(err) }))
    : Promise.resolve(null);
  const [pkg, pathSks, npmGlobal] = await Promise.all([packageRootPromise, pathSksPromise, npmGlobalPromise]);
  add(pkg?.version, 'packageRoot:package.json');
  if (pathSks?.sks) {
    if (pathSks.result.code === 0) add(pathSks.result.stdout, `PATH:${pathSks.sks}`);
    else errors.push(`path_sks_version:${String(pathSks.result.stderr || pathSks.result.stdout || 'failed').trim()}`);
  }
  if (npmGlobal) {
    add(npmGlobal.version, `npm-global:${packageName}`);
    if (npmGlobal.error) errors.push(`npm_global_version:${npmGlobal.error}`);
  }

  const pathCandidate = candidates.find((candidate) => candidate.source.startsWith('PATH:'))?.version || null;
  const npmGlobalCandidate = candidates.find((candidate) => candidate.source.startsWith('npm-global:'))?.version || null;
  const packageRootCandidate = candidates.find((candidate) => candidate.source === 'packageRoot:package.json')?.version || null;
  const current = highestPackageVersion(candidates.map((candidate) => candidate.version));
  return {
    current,
    runtime_current: PACKAGE_VERSION,
    package_root_current: packageRootCandidate,
    path_current: pathCandidate,
    npm_global_current: npmGlobalCandidate,
    candidates,
    errors
  };
}

async function detectNpmGlobalPackageVersion(
  npmBin: string,
  packageName: string,
  env: NodeJS.ProcessEnv,
  opts: { timeoutMs: number; maxOutputBytes: number }
): Promise<{ version: string | null; error?: string }> {
  const result = await runProcess(npmBin, ['list', '-g', packageName, '--json', '--depth=0', '--silent'], {
    env,
    timeoutMs: opts.timeoutMs,
    maxOutputBytes: opts.maxOutputBytes
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  if (result.code === 0 && result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      const version = parseVersionText(parsed?.dependencies?.[packageName]?.version || '');
      if (version) return { version };
    } catch {}
  }
  const rootResult = await runProcess(npmBin, ['root', '-g', '--silent'], {
    env,
    timeoutMs: opts.timeoutMs,
    maxOutputBytes: opts.maxOutputBytes
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  const root = String(rootResult.stdout || '').trim().split(/\r?\n/).pop();
  if (root) {
    const pkg = await readJson<any>(path.join(root, packageName, 'package.json'), null).catch(() => null);
    const version = parseVersionText(pkg?.version || '');
    if (version) return { version };
  }
  return { version: null, error: String(result.stderr || result.stdout || rootResult.stderr || 'npm global package not found').trim() };
}

export function formatSksUpdateCheckText(result: SksUpdateCheckResult): string {
  const lines = [
    'Update Check',
    `Current: ${result.current}`,
    `Latest:  ${result.latest || 'unknown'}`,
    `Update:  ${result.update_available ? 'available' : 'not needed'}`
  ];
  if (result.error) lines.push(`Error:   ${result.error}`);
  if (result.command) lines.push(`Run:     ${result.command}`);
  lines.push('Mode:    function-only');
  return lines.join('\n');
}

export function comparePackageVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = String(a || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function buildResult(input: {
  packageName: string;
  current: string;
  effective: SksEffectiveVersionResult;
  latest: string | null;
  registry: string;
  npmBin: string | null;
  error?: string | null;
}): SksUpdateCheckResult {
  const updateAvailable = Boolean(input.latest && comparePackageVersions(input.latest, input.current) > 0);
  return {
    schema: 'sks.update-check.v2',
    package: input.packageName,
    current: input.current,
    runtime_current: PACKAGE_VERSION,
    package_root_current: input.effective.package_root_current,
    path_current: input.effective.path_current,
    npm_global_current: input.effective.npm_global_current,
    version_candidates: input.effective.candidates,
    latest: input.latest,
    update_available: updateAvailable,
    status: input.error ? 'unavailable' : updateAvailable ? 'available' : 'current',
    mode: 'function',
    route_required: false,
    pipeline_required: false,
    command: updateAvailable ? `sks update now --version ${input.latest}` : null,
    npm_bin: input.npmBin,
    registry: input.registry,
    error: input.error || null
  };
}

function buildUpdateNowResult(input: {
  packageName: string;
  from: string;
  latest: string | null;
  requestedVersion: string | null;
  installVersion: string | null;
  npmBin: string | null;
  npmArgs: string[];
  command: string | null;
  cwd: string;
  registry: string;
  globalRoot: string | null;
  status: SksUpdateNowResult['status'];
  ok: boolean;
  installCode: number | null;
  oldVersionDoctor: PackageLocalDoctorRun | null;
  newBinary: string | null;
  newVersion: string | null;
  newVersionDoctor: PackageLocalDoctorRun | null;
  projectReceipt: UpdateMigrationReceipt | null;
  migrationCurrent: boolean;
  stages: SksUpdateNowStage[];
  error: string | null;
}): SksUpdateNowResult {
  return {
    schema: 'sks.update-now.v2',
    ok: input.ok,
    status: input.status,
    package: input.packageName,
    from: input.from,
    latest: input.latest,
    requested_version: input.requestedVersion,
    install_version: input.installVersion,
    npm_bin: input.npmBin,
    npm_args: input.npmArgs,
    command: input.command,
    cwd: input.cwd,
    registry: input.registry,
    global_root: input.globalRoot,
    install_code: input.installCode,
    old_version_doctor: input.oldVersionDoctor,
    new_binary: input.newBinary,
    new_version: input.newVersion,
    new_version_doctor: input.newVersionDoctor,
    project_receipt: input.projectReceipt,
    migration_current: input.migrationCurrent,
    stages: input.stages,
    error: input.error
  };
}

async function detectNpmGlobalRoot(npmBin: string, env: NodeJS.ProcessEnv, opts: SksUpdateCheckOptions = {}): Promise<string | null> {
  const result = await runProcess(npmBin, ['root', '--global', '--silent'], {
    env,
    timeoutMs: opts.timeoutMs ?? 2500,
    maxOutputBytes: opts.maxOutputBytes ?? 4096
  }).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  return result.code === 0 ? String(result.stdout || '').trim().split(/\r?\n/).pop() || null : null;
}

function versionOverrideEnvName(packageName: string): string {
  return `SKS_NPM_VIEW_${packageName.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_VERSION`;
}

function parseVersionText(text: string): string | null {
  const match = String(text || '').match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match ? match[0] : null;
}

function globalSksRootPath(): string {
  return path.join(process.env.HOME || os.homedir(), '.sneakoscope-global');
}

function updateNowError(
  install: { code: number | null; stdout: string; stderr: string },
  newBinary: string | null,
  newVersionDoctor: PackageLocalDoctorRun | null,
  migrationCurrent: boolean
): string {
  if (install.code !== 0) return `${install.stderr || install.stdout || 'npm global install failed'}`.trim();
  if (!newBinary) return 'new package-local sks binary could not be resolved after install';
  if (!newVersionDoctor?.ok) return newVersionDoctor?.error || 'new-version global Doctor failed';
  if (!migrationCurrent) return 'project update migration receipt was not current';
  return 'update failed';
}

function highestPackageVersion(versions: Array<string | null | undefined>): string {
  return versions
    .filter((version): version is string => typeof version === 'string' && version.length > 0)
    .reduce((best, candidate) => comparePackageVersions(candidate, best) > 0 ? candidate : best, '0.0.0');
}

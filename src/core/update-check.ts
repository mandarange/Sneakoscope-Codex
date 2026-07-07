import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PACKAGE_VERSION, packageRoot, readJson, runProcess, throttleLines, which } from './fsx.js';
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
import { installSksMenuBar, type SksMenuBarInstallResult } from './codex-app/sks-menubar.js';
import { reconcileSkills } from './init/skills.js';
import { codexHookTrustDoctor } from './codex-hooks/codex-hook-trust-doctor.js';
import { readCodexHookActualState } from './codex-hooks/codex-hook-actual-discovery.js';
import { ui as cliUi, withHeartbeat } from '../cli/cli-theme.js';

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
  json?: boolean;
  quiet?: boolean;
}

export interface SksUpdateNowStage {
  id: string;
  ok: boolean;
  status: string;
  detail?: Record<string, unknown>;
}

export interface SksUpdateVerification {
  id: 'version_match' | 'hooks_trusted' | 'dist_stamp' | 'skills_manifest';
  ok: boolean;
  detail?: string;
  remediation?: string;
}

export interface SksUpdateNowResult {
  schema: 'sks.update-now.v2';
  ok: boolean;
  status: 'updated' | 'updated_with_issues' | 'current' | 'dry_run' | 'unavailable' | 'failed';
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
  sks_menubar: SksMenuBarInstallResult | null;
  stages: SksUpdateNowStage[];
  verification: SksUpdateVerification[];
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
  const latestCache = !override ? await readUpdateLatestCache(packageName, registry).catch(() => null) : null;
  const latestPromise = !override && npmBin
    ? runProcess(npmBin, ['view', packageName, 'version', '--silent', '--registry', registry], {
      env,
      timeoutMs: options.timeoutMs ?? 1000,
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
    if (latestCache?.latest) {
      return buildResult({
        packageName,
        current,
        effective,
        latest: latestCache.latest,
        registry,
        npmBin,
        error: null
      });
    }
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
  const latest = String(result.stdout || '').trim().split(/\s+/).pop() || null;
  if (latest) await writeUpdateLatestCache(packageName, registry, latest).catch(() => undefined);
  return buildResult({
    packageName,
    current,
    effective,
    latest,
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
  const quiet = options.quiet === true || /^(1|true)$/i.test(String(env.SKS_UPDATE_QUIET || ''));
  const machineOutput = quiet || options.json === true;
  const stageStart = (id: string, status: string) => {
    if (!machineOutput) cliUi.step(`▸ ${id} - ${status}`);
  };
  const stage = (id: string, ok: boolean, status: string, detail: Record<string, unknown> = {}) => {
    stages.push({ id, ok, status, detail });
    if (!machineOutput) cliUi.step(`${ok ? '✔' : '✖'} ${id} - ${status}`);
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
  if (options.dryRun) {
    stage('old_version_doctor_preflight', true, 'skipped_dry_run', { reason: 'dry_run_does_not_run_doctor_fix' });
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
      oldVersionDoctor: null,
      newBinary: null,
      newVersion: null,
      newVersionDoctor: null,
      projectReceipt: null,
      migrationCurrent: false,
      stages,
      error: null
    });
  }
  if (!requestedVersion && check.latest && !check.update_available) {
    const receipt = await writeProjectUpdateMigrationReceipt({
      root: projectReceiptRoot,
      source: 'update-now-current',
      fromVersion: check.current,
      blockers: [],
      warnings: ['package_already_current']
    }).catch(() => null);
    const migrationCurrent = isUpdateMigrationReceiptCurrent(receipt);
    stage('project_receipt', migrationCurrent, migrationCurrent ? 'current' : 'failed', { root: projectReceiptRoot });
    const sksMenuBar = migrationCurrent
      ? await installUpdateSksMenuBar({ root: projectReceiptRoot, env, stage, quiet: machineOutput })
      : null;
    await runUpdateGlobalSkillsReconcile(stage, { quiet: machineOutput });
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
      sksMenuBar,
      stages,
      error: null
    });
  }

  const oldDoctorTimeoutOverride = Number.parseInt(env.SKS_UPDATE_OLD_DOCTOR_TIMEOUT_MS || '', 10);
  const oldDoctorTimeoutMs = Number.isFinite(oldDoctorTimeoutOverride) && oldDoctorTimeoutOverride > 0
    ? oldDoctorTimeoutOverride
    : 60_000;
  let oldVersionDoctor: PackageLocalDoctorRun | null = null;
  if (env.SKS_UPDATE_SKIP_OLD_DOCTOR_PREFLIGHT === '1') {
    stage('old_version_doctor_preflight', true, 'skipped', { reason: 'SKS_UPDATE_SKIP_OLD_DOCTOR_PREFLIGHT=1' });
  } else {
    stageStart('old_version_doctor_preflight', 'running migration doctor on current install');
    oldVersionDoctor = await updateHeartbeat(machineOutput, 'old-version doctor', runPackageLocalDoctor({
      root: projectReceiptRoot,
      args: ['doctor', '--fix', '--yes', '--profile', 'migration', '--machine-only', '--report-file', path.join(projectReceiptRoot, '.sneakoscope', 'update', 'old-version-doctor.json')],
      env: {
        ...env,
        ...(env.SKS_TEST_OLD_DOCTOR_FAIL === '1' ? { SKS_TEST_DOCTOR_FAIL: '1' } : {})
      },
      timeoutMs: oldDoctorTimeoutMs,
      maxOutputBytes: 32 * 1024
    }), 60_000);
    stage('old_version_doctor_preflight', oldVersionDoctor.ok, oldVersionDoctor.ok ? oldVersionDoctor.status : 'failed_continuing', {
      entrypoint: oldVersionDoctor.entrypoint,
      exit_code: oldVersionDoctor.exit_code,
      timeout_ms: oldDoctorTimeoutMs,
      timed_out: oldVersionDoctor.timedOut,
      note: oldVersionDoctor.ok ? null : 'legacy doctor unreliable; new-version doctor will repair after install'
    });
  }
  const mutationLedgerRoot = env.SKS_MUTATION_LEDGER_ROOT || packageRoot();
  const installContract = createRequestedScopeContract({
    route: 'update',
    userRequest: command || `npm global install ${packageName}`,
    projectRoot: mutationLedgerRoot,
    overrides: { package_install: true }
  });
  const npmStdout = machineOutput ? undefined : throttleLines((line) => process.stderr.write(`  npm | ${line}\n`), 500);
  const npmStderr = machineOutput ? undefined : throttleLines((line) => process.stderr.write(`  npm ! ${line}\n`), 500);
  stageStart('npm_global_install', command || `npm global install ${packageName}`);
  const installOptions: Parameters<typeof guardedPackageInstall>[2] = {
    confirmed: true,
    command: npmBin,
    args: npmArgs,
    cwd,
    env,
    timeoutMs: options.timeoutMs ?? 10 * 60 * 1000,
    maxOutputBytes: options.maxOutputBytes ?? 128 * 1024
  };
  if (npmStdout) installOptions.onStdout = npmStdout;
  if (npmStderr) installOptions.onStderr = npmStderr;
  const install = env.SKS_UPDATE_FAKE_INSTALL === '1'
    ? { code: 0, stdout: 'fake install ok', stderr: '', timedOut: false }
    : await updateHeartbeat(machineOutput, `npm install -g ${packageName}`, guardedPackageInstall(
      guardContextForRoute(mutationLedgerRoot, installContract, command || `npm global install ${packageName}`),
      `${packageName}@${installVersion}`,
      installOptions
    ), 60_000).catch((err: unknown) => ({
      code: 1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      timedOut: false
    }));
  const installOk = install.code === 0;
  stage('npm_global_install', installOk, installOk ? env.SKS_UPDATE_FAKE_INSTALL === '1' ? 'fake_installed' : 'installed' : 'failed', { command, code: install.code });
  let newBinary: string | null = null;
  let newVersion: string | null = null;
  let newVersionDoctor: PackageLocalDoctorRun | null = null;
  let projectReceipt: UpdateMigrationReceipt | null = null;
  let migrationCurrent = false;
  let sksMenuBar: SksMenuBarInstallResult | null = null;
  let hookTrust: any = null;
  if (installOk) {
    newBinary = env.SKS_UPDATE_FAKE_INSTALL === '1'
      ? path.join(packageRoot(), 'dist', 'bin', 'sks.js')
      : await resolveInstalledSksEntrypoint({ packageName, globalRoot, env });
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
      stageStart('new_version_global_doctor', 'running migration doctor on updated install');
      newVersionDoctor = await updateHeartbeat(machineOutput, 'new-version doctor', runPackageLocalDoctor({
        root: globalSksRootPath(),
        entrypoint: newBinary,
        args: ['doctor', '--fix', '--yes', '--profile', 'migration', '--machine-only', '--report-file', path.join(globalSksRootPath(), 'update', 'new-version-doctor.json')],
        env,
        timeoutMs: updateDoctorTimeoutMs(env),
        maxOutputBytes: 32 * 1024
      }), 60_000);
      stage('new_version_global_doctor', newVersionDoctor.ok, newVersionDoctor.status, { entrypoint: newBinary, exit_code: newVersionDoctor.exit_code, timeout_ms: updateDoctorTimeoutMs(env), timed_out: newVersionDoctor.timedOut });
    }
    if (newVersionDoctor?.ok) {
      hookTrust = await codexHookTrustDoctor(projectReceiptRoot, { fix: true, managed: true, actual: true })
        .catch((err: any) => ({ ok: false, blockers: [`hook_trust_repair_failed:${err?.message || err}`] }));
      stage('hook_trust_repair', hookTrust?.ok !== false, hookTrust?.ok !== false ? 'repaired' : 'failed', {
        entries: hookTrust?.current_hash_count ?? null,
        blockers: hookTrust?.blockers || []
      });
    }
    if (newVersionDoctor?.ok && hookTrust?.ok !== false) {
      projectReceipt = await writeProjectUpdateMigrationReceipt({
        root: projectReceiptRoot,
        source: 'update-now',
        doctor: newVersionDoctor,
        updateStages: stages,
        fromVersion: check.current,
        blockers: [],
        warnings: []
      }).catch(() => null);
      migrationCurrent = isUpdateMigrationReceiptCurrent(projectReceipt);
      stage('project_receipt', migrationCurrent, migrationCurrent ? 'current' : 'failed', { root: projectReceiptRoot });
      if (migrationCurrent) sksMenuBar = await installUpdateSksMenuBar({ root: projectReceiptRoot, env, stage, quiet: machineOutput });
      await runUpdateGlobalSkillsReconcile(stage, {
        quiet: machineOutput,
        newPackageRoot: newBinary ? path.resolve(path.dirname(newBinary), '..', '..') : null
      });
      await runUpdateNativeCapabilitySetup(stage, {
        quiet: machineOutput,
        newPackageRoot: newBinary ? path.resolve(path.dirname(newBinary), '..', '..') : null,
        root: projectReceiptRoot
      });
    }
  }
  const verification = await runFinalUpdateVerification({ installOk, newBinary, installVersion, env, projectReceiptRoot });
  const verifyOk = verification.length > 0 && verification.every((item) => item.ok);
  if (verification.length) {
    stage('final_self_verification', verifyOk, verifyOk ? 'verified' : 'issues', {
      failed: verification.filter((item) => !item.ok).map((item) => item.id)
    });
  }
  const baseOk = installOk && Boolean(newBinary) && newVersionDoctor?.ok === true && hookTrust?.ok !== false && migrationCurrent;
  const ok = baseOk && verifyOk;
  const status: SksUpdateNowResult['status'] = ok ? 'updated' : baseOk ? 'updated_with_issues' : 'failed';
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
    status,
    ok,
    installCode: install.code,
    oldVersionDoctor,
    newBinary,
    newVersion,
    newVersionDoctor,
    projectReceipt,
    migrationCurrent,
    sksMenuBar,
    stages,
    verification,
    error: ok ? null : status === 'updated_with_issues' ? verificationError(verification) : updateNowError(install, newBinary, newVersionDoctor, migrationCurrent)
  });
}

async function runUpdateGlobalSkillsReconcile(stage: (id: string, ok: boolean, status: string, detail?: Record<string, unknown>) => void, opts: { quiet?: boolean; newPackageRoot?: string | null } = {}) {
  const targetDir = path.join(os.homedir(), '.agents', 'skills');
  // reconcileSkills stamps ~/.agents/skills/.sks-generated.json with the
  // PACKAGE_VERSION compiled into whichever module runs it. This function
  // executes inside the OLD (driver) binary, so after a real version install
  // an in-process reconcile would overwrite the manifest the new binary's
  // migration doctor just wrote and make final self-verification report
  // skills_manifest stale forever. Delegate to the freshly installed package.
  if (opts.newPackageRoot) {
    const moduleHref = pathToFileURL(path.join(opts.newPackageRoot, 'dist', 'core', 'init', 'skills.js')).href;
    const script = [
      `const m = await import(${JSON.stringify(moduleHref)});`,
      `const r = await m.reconcileSkills({ targetDir: ${JSON.stringify(targetDir)}, scope: 'global', fix: true });`,
      'console.log(JSON.stringify(r));',
      'if (r && (r.ok === false || r.error)) process.exit(1);'
    ].join('\n');
    const work = runProcess(process.execPath, ['--input-type=module', '-e', script], {
      timeoutMs: 120_000,
      maxOutputBytes: 1024 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    const run = opts.quiet ? await work : await withHeartbeat('skills reconcile', work, { warnAfterMs: 30_000 });
    let parsed: any = null;
    for (const line of String(run.stdout || '').trim().split('\n').reverse()) {
      try { parsed = JSON.parse(line); break; } catch { /* not the JSON result line */ }
    }
    const ok = run.code === 0 && parsed?.ok !== false && !parsed?.error;
    stage('global_skills_reconcile', ok, ok ? 'reconciled' : 'failed', {
      via: 'new_package_binary',
      installed: Array.isArray(parsed?.installed) ? parsed.installed.length : null,
      updated: Array.isArray(parsed?.updated) ? parsed.updated.length : null,
      removed: Array.isArray(parsed?.removed) ? parsed.removed.length : null,
      error: ok ? null : parsed?.error || String(run.stderr || '').trim().slice(-400) || `exit_${run.code}`
    });
    return parsed || { schema: 'sks.skill-reconcile.v1', ok };
  }
  const work = reconcileSkills({
    targetDir,
    scope: 'global',
    fix: true
  }).catch((err: any) => ({ schema: 'sks.skill-reconcile.v1', ok: false, error: err?.message || String(err) }));
  const result = opts.quiet ? await work : await withHeartbeat('skills reconcile', work, { warnAfterMs: 30_000 });
  const ok = (result as any).ok !== false && !(result as any).error;
  stage('global_skills_reconcile', ok, ok ? 'reconciled' : 'failed', {
    installed: Array.isArray((result as any).installed) ? (result as any).installed.length : null,
    updated: Array.isArray((result as any).updated) ? (result as any).updated.length : null,
    removed: Array.isArray((result as any).removed) ? (result as any).removed.length : null,
    error: (result as any).error || null
  });
  return result;
}

async function runUpdateNativeCapabilitySetup(
  stage: (id: string, ok: boolean, status: string, detail?: Record<string, unknown>) => void,
  opts: { quiet?: boolean; newPackageRoot?: string | null; root: string }
) {
  if (!opts.newPackageRoot) {
    stage('native_capability_setup', true, 'skipped', { reason: 'new_package_root_unresolved' });
    return null;
  }
  const root = opts.root;
  const moduleHref = (rel: string) => pathToFileURL(path.join(opts.newPackageRoot as string, 'dist', 'core', 'doctor', rel)).href;
  // Same as global_skills_reconcile above: run the newly installed package's own
  // modules in a subprocess rather than in-process, so an old (pre-update) driver
  // binary never runs post-update repair logic with stale compiled-in behavior.
  const script = [
    `const [{ repairCodexImagegen }, { repairComputerUse }, { repairBrowserUse }] = await Promise.all([import(${JSON.stringify(moduleHref('imagegen-repair.js'))}), import(${JSON.stringify(moduleHref('computer-use-repair.js'))}), import(${JSON.stringify(moduleHref('browser-use-repair.js'))})]);`,
    `const root = ${JSON.stringify(root)};`,
    'const imagegen = await repairCodexImagegen({ root, apply: true, reportPath: null }).catch((err) => ({ ok: false, recovered: false, attempted: true, error: String((err && err.message) || err) }));',
    'const computerUse = await repairComputerUse({ root, apply: true, reportPath: null }).catch((err) => ({ ok: false, recovered: false, attempted: true, error: String((err && err.message) || err) }));',
    'const browserUse = await repairBrowserUse({ root, apply: true, reportPath: null }).catch((err) => ({ ok: false, recovered: false, attempted: true, error: String((err && err.message) || err) }));',
    'console.log(JSON.stringify({ imagegen, computer_use: computerUse, browser_use: browserUse }));'
  ].join('\n');
  const work = runProcess(process.execPath, ['--input-type=module', '-e', script], {
    timeoutMs: 180_000,
    maxOutputBytes: 1024 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  const run = opts.quiet ? await work : await withHeartbeat('native capability setup', work, { warnAfterMs: 30_000 });
  let parsed: any = null;
  for (const line of String(run.stdout || '').trim().split('\n').reverse()) {
    try { parsed = JSON.parse(line); break; } catch { /* not the JSON result line */ }
  }
  const summarize = (r: any) => (r?.recovered === true || r?.ok === true ? 'ok' : r?.attempted ? 'blocked' : 'not-needed');
  const ok = run.code === 0 && Boolean(parsed);
  // A repair reporting 'blocked' (e.g. no verified CLI subcommand for a plugin
  // install) is a valid, honest terminal state for this stage, not a stage
  // failure — the update itself must not be blocked on a manual-only step.
  stage('native_capability_setup', ok, ok ? 'completed' : 'failed', {
    via: 'new_package_binary',
    summary: ok
      ? { imagegen: summarize(parsed.imagegen), computer_use: summarize(parsed.computer_use), browser_use: summarize(parsed.browser_use) }
      : null,
    error: ok ? null : String(run.stderr || '').trim().slice(-400) || `exit_${run.code}`
  });
  return parsed;
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
  const current = effectiveInstalledVersion(candidates);
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

async function readUpdateLatestCache(packageName: string, registry: string): Promise<{ latest: string | null } | null> {
  const file = updateLatestCachePath(packageName, registry);
  const text = await fs.readFile(file, 'utf8');
  const parsed = JSON.parse(text);
  if (parsed?.package !== packageName || parsed?.registry !== registry || !parsed?.latest || !parsed?.generated_at) return null;
  const ageMs = Date.now() - Date.parse(parsed.generated_at);
  if (!Number.isFinite(ageMs) || ageMs > 6 * 60 * 60 * 1000) return null;
  return { latest: String(parsed.latest) };
}

async function writeUpdateLatestCache(packageName: string, registry: string, latest: string): Promise<void> {
  const file = updateLatestCachePath(packageName, registry);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({
    schema: 'sks.update-check-cache.v1',
    generated_at: new Date().toISOString(),
    package: packageName,
    registry,
    latest
  }, null, 2)}\n`, 'utf8');
}

function updateLatestCachePath(packageName: string, registry: string): string {
  const safe = `${packageName}-${registry}`.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120);
  return path.join(os.tmpdir(), 'sks-update-check-cache', `${safe}.json`);
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
  sksMenuBar?: SksMenuBarInstallResult | null;
  stages: SksUpdateNowStage[];
  verification?: SksUpdateVerification[];
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
    sks_menubar: input.sksMenuBar || null,
    stages: input.stages,
    verification: input.verification || [],
    error: input.error
  };
}

async function installUpdateSksMenuBar(input: {
  root: string;
  env: NodeJS.ProcessEnv;
  stage: (id: string, ok: boolean, status: string, detail?: Record<string, unknown>) => void;
  quiet?: boolean;
}): Promise<SksMenuBarInstallResult | null> {
  if (input.env.SKS_UPDATE_SKIP_SKS_MENUBAR === '1') {
    input.stage('sks_menubar', true, 'skipped', { reason: 'SKS_UPDATE_SKIP_SKS_MENUBAR=1' });
    return null;
  }
  const work = installSksMenuBar({
    root: input.root,
    apply: true,
    launch: true,
    env: input.env,
    quiet: input.quiet === true
  }).catch((err: any) => ({
    schema: 'sks.codex-app-sks-menubar.v1',
    ok: false,
    apply: true,
    status: 'blocked',
    platform: process.platform,
    app_path: null,
    executable_path: null,
    launch_agent_path: null,
    action_script_path: null,
    build_stamp_path: null,
    report_path: path.join(input.root, '.sneakoscope', 'reports', 'sks-menubar.json'),
    menu_items: [],
    actions: [],
    launch: { requested: true, method: 'none', ok: false, error: err?.message || String(err) },
    tcc_automation_status: 'unknown',
    next_actions: [
      'Run: sks menubar status',
      'Run: sks menubar install',
      'Run: sks menubar restart',
      'Rotate CODEX_LB_API_KEY and OPENROUTER_API_KEY if they were previously exposed in launchd.'
    ],
    blockers: [err?.message || String(err)],
    warnings: []
  } as SksMenuBarInstallResult));
  const result = input.quiet ? await work : await withHeartbeat('SKS menu bar install', work, { warnAfterMs: 30_000 });
  input.stage('sks_menubar', result.ok !== false, result.status, {
    app_path: result.app_path,
    launch_agent_path: result.launch_agent_path,
    launch: result.launch
  });
  return result;
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

function updateDoctorTimeoutMs(env: NodeJS.ProcessEnv): number {
  const override = Number.parseInt(env.SKS_UPDATE_NEW_DOCTOR_TIMEOUT_MS || env.SKS_MIGRATION_DOCTOR_TIMEOUT_MS || '', 10);
  return Number.isFinite(override) && override > 0 ? override : 180_000;
}

async function updateHeartbeat<T>(quiet: boolean, label: string, work: Promise<T>, warnAfterMs = 60_000): Promise<T> {
  return quiet ? work : withHeartbeat(label, work, { warnAfterMs });
}

async function runFinalUpdateVerification(input: {
  installOk: boolean;
  newBinary: string | null;
  installVersion: string | null;
  env: NodeJS.ProcessEnv;
  projectReceiptRoot: string;
}): Promise<SksUpdateVerification[]> {
  if (!input.installOk || !input.newBinary || !input.installVersion) return [];
  const verification: SksUpdateVerification[] = [];
  const versionProbe = await runProcess(process.execPath, [input.newBinary, '--version'], {
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    env: { ...input.env, SKS_UPDATE_MIGRATION_GATE_DISABLED: '1', SKS_DISABLE_UPDATE_CHECK: '1' }
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  const got = parseVersionText(`${(versionProbe as any).stdout || ''}\n${(versionProbe as any).stderr || ''}`);
  verification.push({
    id: 'version_match',
    ok: got === input.installVersion,
    detail: `expected ${input.installVersion}, got ${got || 'missing'}`,
    remediation: 'Run: sks update now --version <expected>'
  });

  const hookState = await readCodexHookActualState(input.projectReceiptRoot).catch(() => null);
  const managedEntries = (hookState?.entries || []).filter((entry: any) => entry.managed === true);
  const untrusted = managedEntries.filter((entry: any) => entry.trust_status !== 'Trusted' && entry.trust_status !== 'Managed');
  verification.push({
    id: 'hooks_trusted',
    ok: Boolean(hookState && hookState.ok !== false && managedEntries.length > 0 && untrusted.length === 0),
    detail: untrusted.length ? untrusted.map((entry: any) => entry.key).slice(0, 3).join(', ') : `managed ${managedEntries.length}`,
    remediation: 'Run: sks codex trust-doctor --fix --managed --actual'
  });

  const stampPath = path.join(path.dirname(input.newBinary), '..', '.sks-build-stamp.json');
  const stamp = await readJson<any>(stampPath, null).catch(() => null);
  const stampVersion = stamp?.package_version || stamp?.version || null;
  verification.push({
    id: 'dist_stamp',
    ok: stampVersion === input.installVersion,
    detail: `expected ${input.installVersion}, got ${stampVersion || 'missing'}`,
    remediation: 'Run: npm run build:incremental'
  });

  const home = input.env.HOME || os.homedir();
  const skillsManifest = await readJson<any>(path.join(home, '.agents', 'skills', '.sks-generated.json'), null).catch(() => null);
  verification.push({
    id: 'skills_manifest',
    ok: skillsManifest?.version === input.installVersion,
    detail: `expected ${input.installVersion}, got ${skillsManifest?.version || 'missing'}`,
    remediation: 'Run: sks doctor --fix --yes'
  });
  return verification;
}

function verificationError(verification: SksUpdateVerification[]): string {
  const failed = verification.filter((item) => !item.ok);
  return failed.length
    ? `update self-verification failed: ${failed.map((item) => item.id).join(', ')}`
    : 'update self-verification did not run';
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

function effectiveInstalledVersion(candidates: SksVersionCandidate[]): string {
  const firstBySource = (source: string) => candidates.find((candidate) => candidate.source === source)?.version || null;
  const firstByPrefix = (prefix: string) => candidates.find((candidate) => candidate.source.startsWith(prefix))?.version || null;
  return firstBySource('env:SKS_INSTALLED_SKS_VERSION')
    || firstByPrefix('npm-global:')
    || firstByPrefix('PATH:')
    || firstBySource('runtime')
    || firstBySource('packageRoot:package.json')
    || highestPackageVersion(candidates.map((candidate) => candidate.version));
}

function highestPackageVersion(versions: Array<string | null | undefined>): string {
  return versions
    .filter((version): version is string => typeof version === 'string' && version.length > 0)
    .reduce((best, candidate) => comparePackageVersions(candidate, best) > 0 ? candidate : best, '0.0.0');
}

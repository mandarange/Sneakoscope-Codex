import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, exists, globalSksRoot, nowIso, packageRoot, PACKAGE_VERSION, projectRoot, readJson, runProcess, sha256, which, writeJsonAtomic } from '../fsx.js';
import { MANAGED_ASSET_VERSION } from '../managed-assets/managed-assets-manifest.js';
import { enforceRetention } from '../retention.js';

export const UPDATE_MIGRATION_SCHEMA = 'sks.project-migration-receipt.v2' as const;
export const INSTALLATION_EPOCH_SCHEMA = 'sks.installation-epoch.v1' as const;

export interface InstallationEpoch {
  schema: typeof INSTALLATION_EPOCH_SCHEMA;
  sks_version: string;
  package_realpath: string;
  build_sha256: string;
  managed_asset_version: string;
  installed_at: string;
  source: string;
}

export interface PackageLocalDoctorRun {
  schema: 'sks.package-local-doctor-run.v1';
  ok: boolean;
  status: 'ok' | 'failed' | 'missing_entrypoint';
  entrypoint: string | null;
  cwd: string;
  args: string[];
  exit_code: number | null;
  parsed_ok: boolean | null;
  required_blockers: string[];
  optional_warnings: string[];
  stdout_tail: string;
  stderr_tail: string;
  error: string | null;
}

export interface UpdateRetentionCleanupRun {
  schema: 'sks.update-retention-cleanup.v1';
  ok: boolean;
  status: 'completed' | 'skipped' | 'failed';
  root: string;
  source: string;
  generated_at: string;
  action_count: number;
  cleanup_report_path: string | null;
  storage_report_path: string | null;
  reason?: string;
  error?: string | null;
}

export interface UpdateMigrationReceipt {
  schema: typeof UPDATE_MIGRATION_SCHEMA;
  status: 'current' | 'pending_project_receipt' | 'blocked' | 'skipped';
  sks_version: string;
  root: string;
  source: string;
  generated_at: string;
  project_root_hash?: string;
  installation_epoch_sha256?: string;
  project_semantic_hash?: string;
  pending_marker_path?: string | null;
  installation_epoch_path?: string | null;
  doctor?: PackageLocalDoctorRun | null;
  retention_cleanup?: UpdateRetentionCleanupRun | null;
  update_stages?: unknown[];
  required_blockers?: string[];
  optional_warnings?: string[];
  blockers: string[];
  warnings: string[];
}

export interface UpdateMigrationGateResult {
  schema: 'sks.update-migration-gate.v1';
  ok: boolean;
  status: 'current' | 'repaired' | 'skipped' | 'blocked';
  root: string;
  command: string;
  receipt_path: string;
  pending_marker_path: string;
  installation_epoch_path: string;
  receipt: UpdateMigrationReceipt | null;
  doctor: PackageLocalDoctorRun | null;
  blockers: string[];
  warnings: string[];
}

const ALLOWLIST_COMMANDS = new Set([
  'doctor',
  'postinstall',
  'update',
  'update-check',
  'version',
  'help',
  'commands',
  'usage',
  'root',
  'rollback',
  'status',
  'paths',
  'codex',
  'zellij'
]);

export function installationEpochPath(): string {
  return path.join(globalSksRoot(), 'update', 'installation-epoch.json');
}

export function pendingUpdateMigrationPath(): string {
  return installationEpochPath();
}

export function projectUpdateMigrationReceiptPath(root: string): string {
  return path.join(root, '.sneakoscope', 'update', 'migration-receipt.json');
}

export async function readPendingUpdateMigration(): Promise<UpdateMigrationReceipt | null> {
  const epoch = await readInstallationEpoch();
  if (!epoch) return null;
  return {
    schema: UPDATE_MIGRATION_SCHEMA,
    status: 'pending_project_receipt',
    sks_version: epoch.sks_version,
    root: globalSksRoot(),
    source: epoch.source,
    generated_at: epoch.installed_at,
    pending_marker_path: installationEpochPath(),
    installation_epoch_path: installationEpochPath(),
    installation_epoch_sha256: installationEpochSha256(epoch),
    blockers: [],
    warnings: []
  };
}

export async function readProjectUpdateMigrationReceipt(root: string): Promise<UpdateMigrationReceipt | null> {
  return readJson<UpdateMigrationReceipt | null>(projectUpdateMigrationReceiptPath(root), null).catch(() => null);
}

export function isUpdateMigrationReceiptCurrent(receipt: UpdateMigrationReceipt | null | undefined): boolean {
  return receipt?.schema === UPDATE_MIGRATION_SCHEMA
    && receipt.status === 'current'
    && receipt.sks_version === PACKAGE_VERSION
    && typeof receipt.installation_epoch_sha256 === 'string'
    && Array.isArray(receipt.blockers)
    && receipt.blockers.length === 0
    && (!Array.isArray(receipt.required_blockers) || receipt.required_blockers.length === 0);
}

export async function readInstallationEpoch(): Promise<InstallationEpoch | null> {
  return readJson<InstallationEpoch | null>(installationEpochPath(), null).catch(() => null);
}

export async function ensureInstallationEpoch(source = 'runtime'): Promise<InstallationEpoch> {
  const current = await buildInstallationEpoch(source);
  const existing = await readInstallationEpoch();
  if (existing && isInstallationEpochCurrent(existing, current)) return existing;
  await writeJsonAtomic(installationEpochPath(), current);
  return current;
}

export async function writePendingUpdateMigration(input: {
  source: string;
  doctor?: PackageLocalDoctorRun | null;
  blockers?: string[];
  warnings?: string[];
}): Promise<UpdateMigrationReceipt> {
  const epoch = await ensureInstallationEpoch(input.source);
  const pendingPath = installationEpochPath();
  const receipt: UpdateMigrationReceipt = {
    schema: UPDATE_MIGRATION_SCHEMA,
    status: 'pending_project_receipt',
    sks_version: PACKAGE_VERSION,
    root: globalSksRoot(),
    source: input.source,
    generated_at: nowIso(),
    pending_marker_path: pendingPath,
    installation_epoch_path: pendingPath,
    installation_epoch_sha256: installationEpochSha256(epoch),
    doctor: input.doctor || null,
    required_blockers: input.blockers || [],
    optional_warnings: input.warnings || [],
    blockers: input.blockers || [],
    warnings: input.warnings || []
  };
  return receipt;
}

export async function clearPendingUpdateMigration(): Promise<void> {
  // v2 keeps a persistent installation epoch; project receipts are compared
  // independently and one project must not consume global migration state.
}

export async function writeProjectUpdateMigrationReceipt(input: {
  root: string;
  source: string;
  status?: UpdateMigrationReceipt['status'];
  doctor?: PackageLocalDoctorRun | null;
  updateStages?: unknown[];
  blockers?: string[];
  warnings?: string[];
}): Promise<UpdateMigrationReceipt> {
  const receiptPath = projectUpdateMigrationReceiptPath(input.root);
  const epoch = await ensureInstallationEpoch(input.source);
  const retentionCleanup = await runUpdateRetentionCleanup(input.root, input.source);
  const requiredBlockers = input.blockers || [];
  const optionalWarnings = input.warnings || [];
  const receipt: UpdateMigrationReceipt = {
    schema: UPDATE_MIGRATION_SCHEMA,
    status: input.status || 'current',
    sks_version: PACKAGE_VERSION,
    root: input.root,
    source: input.source,
    generated_at: nowIso(),
    project_root_hash: projectRootHash(input.root),
    installation_epoch_sha256: installationEpochSha256(epoch),
    project_semantic_hash: await projectSemanticHash(input.root),
    pending_marker_path: installationEpochPath(),
    installation_epoch_path: installationEpochPath(),
    doctor: input.doctor || null,
    retention_cleanup: retentionCleanup,
    update_stages: input.updateStages || [],
    required_blockers: requiredBlockers,
    optional_warnings: optionalWarnings,
    blockers: requiredBlockers,
    warnings: optionalWarnings
  };
  await writeJsonAtomic(receiptPath, receipt);
  return receipt;
}

export async function runUpdateRetentionCleanup(root: string, source = 'update-migration'): Promise<UpdateRetentionCleanupRun> {
  const missionsPath = path.join(root, '.sneakoscope', 'missions');
  const cleanupPath = path.join(root, '.sneakoscope', 'reports', 'retention-cleanup.json');
  const storagePath = path.join(root, '.sneakoscope', 'reports', 'storage.json');
  if (process.env.SKS_UPDATE_RETENTION_CLEANUP === '0') {
    return {
      schema: 'sks.update-retention-cleanup.v1',
      ok: true,
      status: 'skipped',
      root,
      source,
      generated_at: nowIso(),
      action_count: 0,
      cleanup_report_path: null,
      storage_report_path: null,
      reason: 'disabled_by_env'
    };
  }
  if (!(await exists(missionsPath))) {
    return {
      schema: 'sks.update-retention-cleanup.v1',
      ok: true,
      status: 'skipped',
      root,
      source,
      generated_at: nowIso(),
      action_count: 0,
      cleanup_report_path: null,
      storage_report_path: null,
      reason: 'missions_missing'
    };
  }
  try {
    const result = await enforceRetention(root, {
      mode: 'update_migration',
      pruneReportLogs: true,
      policy: { max_tmp_age_hours: 0 }
    });
    return {
      schema: 'sks.update-retention-cleanup.v1',
      ok: true,
      status: 'completed',
      root,
      source,
      generated_at: nowIso(),
      action_count: Array.isArray(result.actions) ? result.actions.length : 0,
      cleanup_report_path: cleanupPath,
      storage_report_path: storagePath
    };
  } catch (err: any) {
    return {
      schema: 'sks.update-retention-cleanup.v1',
      ok: false,
      status: 'failed',
      root,
      source,
      generated_at: nowIso(),
      action_count: 0,
      cleanup_report_path: null,
      storage_report_path: null,
      error: err?.message || String(err)
    };
  }
}

export async function ensureCurrentMigrationBeforeCommand(input: {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<UpdateMigrationGateResult> {
  const env = input.env || process.env;
  const command = input.command;
  const root = await projectRoot(input.cwd || process.cwd()).catch(() => path.resolve(input.cwd || process.cwd()));
  const receiptPath = projectUpdateMigrationReceiptPath(root);
  const pendingPath = installationEpochPath();
  const empty: Omit<UpdateMigrationGateResult, 'ok' | 'status' | 'receipt' | 'doctor' | 'blockers' | 'warnings'> = {
    schema: 'sks.update-migration-gate.v1',
    root,
    command,
    receipt_path: receiptPath,
    pending_marker_path: pendingPath,
    installation_epoch_path: pendingPath
  };
  if (env.SKS_UPDATE_MIGRATION_GATE_DISABLED === '1') {
    return { ...empty, ok: true, status: 'skipped', receipt: null, doctor: null, blockers: [], warnings: ['gate_disabled_by_env'] };
  }
  if (ALLOWLIST_COMMANDS.has(command)) {
    return { ...empty, ok: true, status: 'skipped', receipt: null, doctor: null, blockers: [], warnings: [`allowlisted_command:${command}`] };
  }

  const [epoch, receipt] = await Promise.all([
    ensureInstallationEpoch('first-command-gate'),
    readProjectUpdateMigrationReceipt(root)
  ]);
  const requireReceipt = env.SKS_REQUIRE_UPDATE_MIGRATION_RECEIPT === '1';
  if (isProjectReceiptCurrentForEpoch(receipt, epoch) && !requireReceipt) {
    return { ...empty, ok: true, status: 'current', receipt, doctor: null, blockers: [], warnings: [] };
  }

  const recheck = requireReceipt
    ? undefined
    : async (): Promise<UpdateMigrationGateResult | null> => {
        const fresh = await readProjectUpdateMigrationReceipt(root);
        if (isProjectReceiptCurrentForEpoch(fresh, epoch)) {
          return { ...empty, ok: true, status: 'current', receipt: fresh, doctor: null, blockers: [], warnings: [] };
        }
        return null;
      };

  return withUpdateMigrationLock(root, empty, async () => {
    const reportFile = path.join(root, '.sneakoscope', 'update', `doctor-migration-${Date.now()}.json`);
    const doctor = await runPackageLocalDoctor({
      root,
      args: ['doctor', '--fix', '--yes', '--profile', 'migration', '--machine-only', '--report-file', reportFile],
      env: {
        ...env,
        SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
        SKS_DISABLE_UPDATE_CHECK: '1'
      },
      timeoutMs: 15_000,
      maxOutputBytes: 32 * 1024
    });
    if (!doctor.ok) {
      const requiredBlockers = doctor.required_blockers.length ? doctor.required_blockers : ['doctor_migration_profile_failed'];
      const blocked = await writeProjectUpdateMigrationReceipt({
        root,
        source: 'first-command-gate',
        status: 'blocked',
        doctor,
        blockers: requiredBlockers,
        warnings: doctor.optional_warnings
      });
      return { ...empty, ok: false, status: 'blocked', receipt: blocked, doctor, blockers: requiredBlockers, warnings: doctor.optional_warnings };
    }
    const current = await writeProjectUpdateMigrationReceipt({
      root,
      source: 'first-command-gate',
      doctor,
      blockers: [],
      warnings: doctor.optional_warnings
    });
    return { ...empty, ok: true, status: 'repaired', receipt: current, doctor, blockers: [], warnings: [] };
  }, recheck ? { recheck } : {});
}

export async function runPostinstallGlobalDoctorAndMarkPending(input: {
  env?: NodeJS.ProcessEnv;
} = {}): Promise<{ schema: 'sks.postinstall-global-doctor.v1'; ok: boolean; doctor: PackageLocalDoctorRun | null; pending: UpdateMigrationReceipt | null; blockers: string[]; warnings: string[] }> {
  const env = input.env || process.env;
  if (env.SKS_POSTINSTALL_GLOBAL_DOCTOR === '0') {
    const pending = await writePendingUpdateMigration({
      source: 'postinstall',
      doctor: null,
      warnings: ['global_doctor_skipped_by_env']
    });
    return { schema: 'sks.postinstall-global-doctor.v1', ok: true, doctor: null, pending, blockers: [], warnings: ['global_doctor_skipped_by_env'] };
  }
  const doctor = await runPackageLocalDoctor({
    root: globalSksRoot(),
    args: ['doctor', '--fix', '--yes', '--profile', 'migration', '--machine-only', '--report-file', path.join(globalSksRoot(), 'update', `postinstall-doctor-${Date.now()}.json`)],
    env: {
      ...env,
      SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
      SKS_DISABLE_UPDATE_CHECK: '1',
      SKS_POSTINSTALL_NO_BOOTSTRAP: '1'
    },
    timeoutMs: 15_000,
    maxOutputBytes: 32 * 1024
  });
  const pending = await writePendingUpdateMigration({
    source: 'postinstall',
    doctor,
    blockers: doctor.ok ? [] : ['postinstall_global_doctor_failed']
  });
  return {
    schema: 'sks.postinstall-global-doctor.v1',
    ok: doctor.ok,
    doctor,
    pending,
    blockers: doctor.ok ? [] : ['postinstall_global_doctor_failed'],
    warnings: []
  };
}

export async function runPackageLocalDoctor(input: {
  root?: string;
  entrypoint?: string | null;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
} = {}): Promise<PackageLocalDoctorRun> {
  const entrypoint = input.entrypoint || path.join(packageRoot(), 'dist', 'bin', 'sks.js');
  const cwd = input.root || globalSksRoot();
  const args = input.args || ['doctor', '--json'];
  if (!(await exists(entrypoint))) {
    return {
      schema: 'sks.package-local-doctor-run.v1',
      ok: false,
      status: 'missing_entrypoint',
      entrypoint,
      cwd,
      args,
      exit_code: null,
      parsed_ok: null,
      required_blockers: ['missing_package_local_sks_entrypoint'],
      optional_warnings: [],
      stdout_tail: '',
      stderr_tail: '',
      error: `missing package-local sks entrypoint: ${entrypoint}`
    };
  }
  const result = await runProcess(process.execPath, [entrypoint, ...args], {
    cwd,
    env: {
      ...process.env,
      ...(input.env || {}),
      SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
      SKS_DISABLE_UPDATE_CHECK: '1'
    },
    timeoutMs: input.timeoutMs ?? 5 * 60 * 1000,
    maxOutputBytes: input.maxOutputBytes ?? 64 * 1024
  }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err?.message || String(err)
  }));
  const reportFile = reportFileFromArgs(args);
  const parsed = reportFile
    ? await readJson(reportFile, null).catch(() => null)
    : parseDoctorJson((result as any).stdout);
  const parsedOk = typeof parsed?.ok === 'boolean' ? parsed.ok : null;
  const ok = (result as any).code === 0 && (reportFile ? parsedOk === true : parsedOk !== false);
  const requiredBlockers = extractRequiredBlockers(parsed, ok);
  const optionalWarnings = extractOptionalWarnings(parsed);
  return {
    schema: 'sks.package-local-doctor-run.v1',
    ok,
    status: ok ? 'ok' : 'failed',
    entrypoint,
    cwd,
    args,
    exit_code: (result as any).code ?? null,
    parsed_ok: parsedOk,
    required_blockers: requiredBlockers,
    optional_warnings: optionalWarnings,
    stdout_tail: tail((result as any).stdout || ''),
    stderr_tail: tail((result as any).stderr || ''),
    error: ok ? null : tail((result as any).stderr || (result as any).stdout || requiredBlockers.join(', ') || 'doctor failed')
  };
}

export async function resolveInstalledSksEntrypoint(input: {
  packageName?: string;
  globalRoot?: string | null;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<string | null> {
  const packageName = input.packageName || 'sneakoscope';
  const candidates = [
    input.globalRoot ? path.join(input.globalRoot, packageName, 'dist', 'bin', 'sks.js') : null,
    path.join(packageRoot(), 'dist', 'bin', 'sks.js')
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return which('sks');
}

const MIGRATION_LOCK_WAIT_MS = 20_000;
const MIGRATION_LOCK_POLL_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withUpdateMigrationLock(
  root: string,
  base: Omit<UpdateMigrationGateResult, 'ok' | 'status' | 'receipt' | 'doctor' | 'blockers' | 'warnings'>,
  fn: () => Promise<UpdateMigrationGateResult>,
  options: { recheck?: () => Promise<UpdateMigrationGateResult | null>; maxWaitMs?: number } = {}
): Promise<UpdateMigrationGateResult> {
  const lockPath = path.join(root, '.sneakoscope', 'update', 'migration.lock');
  await ensureDir(path.dirname(lockPath));
  const recheck = options.recheck ?? null;
  const deadline = Date.now() + (options.maxWaitMs ?? MIGRATION_LOCK_WAIT_MS);
  let reapedStale = false;
  for (;;) {
    let handle: fsp.FileHandle | null = null;
    try {
      handle = await fsp.open(lockPath, 'wx');
    } catch (err: any) {
      if (err?.code !== 'EEXIST') {
        return { ...base, ok: false, status: 'blocked', receipt: null, doctor: null, blockers: [`update_migration_lock_error:${err?.message || String(err)}`], warnings: [] };
      }
      // The lock is held by a concurrent process. Cooperate instead of failing fast:
      // 1) a sibling may have already completed the migration we need.
      if (recheck) {
        const done = await recheck();
        if (done) return done;
      }
      // 2) reap a genuinely stale lock (dead holder or older than the stale threshold).
      if (!reapedStale && await removeStaleMigrationLock(lockPath)) {
        reapedStale = true;
        continue;
      }
      // 3) wait for the in-flight holder to finish, then retry acquisition.
      if (Date.now() < deadline) {
        await delay(MIGRATION_LOCK_POLL_MS);
        continue;
      }
      // 4) gave up waiting on a live holder.
      return { ...base, ok: false, status: 'blocked', receipt: null, doctor: null, blockers: ['update_migration_lock_held'], warnings: [] };
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, created_at: nowIso(), version: PACKAGE_VERSION }) + '\n', 'utf8');
      return await fn();
    } catch (err: any) {
      return { ...base, ok: false, status: 'blocked', receipt: null, doctor: null, blockers: [`update_migration_lock_error:${err?.message || String(err)}`], warnings: [] };
    } finally {
      await handle.close().catch(() => undefined);
      await fsp.rm(lockPath, { force: true }).catch(() => undefined);
    }
  }
}

async function removeStaleMigrationLock(lockPath: string): Promise<boolean> {
  const raw = await fsp.readFile(lockPath, 'utf8').catch(() => '');
  let parsed: { pid?: number; created_at?: string } | null = null;
  try {
    parsed = raw.trim() ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const pid = Number(parsed?.pid || 0);
  const createdMs = parsed?.created_at ? Date.parse(parsed.created_at) : 0;
  const ageMs = Number.isFinite(createdMs) && createdMs > 0 ? Date.now() - createdMs : Number.POSITIVE_INFINITY;
  const stale = !pidAlive(pid) || ageMs > 120_000;
  if (!stale) return false;
  await fsp.rm(lockPath, { force: true }).catch(() => undefined);
  return true;
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

async function buildInstallationEpoch(source: string): Promise<InstallationEpoch> {
  const root = packageRoot();
  const realpath = await fsp.realpath(root).catch(() => root);
  return {
    schema: INSTALLATION_EPOCH_SCHEMA,
    sks_version: PACKAGE_VERSION,
    package_realpath: realpath,
    build_sha256: await packageBuildSha256(root),
    managed_asset_version: MANAGED_ASSET_VERSION,
    installed_at: nowIso(),
    source
  };
}

function isInstallationEpochCurrent(existing: InstallationEpoch, current: InstallationEpoch): boolean {
  return existing.schema === INSTALLATION_EPOCH_SCHEMA
    && existing.sks_version === current.sks_version
    && existing.package_realpath === current.package_realpath
    && existing.build_sha256 === current.build_sha256
    && existing.managed_asset_version === current.managed_asset_version;
}

async function packageBuildSha256(root: string): Promise<string> {
  const candidates = [
    path.join(root, 'dist', 'build-manifest.json'),
    path.join(root, 'package.json')
  ];
  const rows = await Promise.all(candidates.map(async (file) => {
    const text = await fsp.readFile(file, 'utf8').catch(() => '');
    return { file: path.relative(root, file), sha256: text ? sha256(text) : 'missing' };
  }));
  return sha256(JSON.stringify(rows));
}

function installationEpochSha256(epoch: InstallationEpoch): string {
  return sha256(JSON.stringify({
    schema: epoch.schema,
    sks_version: epoch.sks_version,
    package_realpath: epoch.package_realpath,
    build_sha256: epoch.build_sha256,
    managed_asset_version: epoch.managed_asset_version
  }));
}

function isProjectReceiptCurrentForEpoch(receipt: UpdateMigrationReceipt | null, epoch: InstallationEpoch): boolean {
  return isUpdateMigrationReceiptCurrent(receipt)
    && receipt?.installation_epoch_sha256 === installationEpochSha256(epoch);
}

function projectRootHash(root: string): string {
  return sha256(path.resolve(root));
}

async function projectSemanticHash(root: string): Promise<string> {
  const configPath = path.join(root, '.codex', 'config.toml');
  const config = await fsp.readFile(configPath, 'utf8').catch(() => '');
  return sha256(JSON.stringify({
    root: projectRootHash(root),
    sks_version: PACKAGE_VERSION,
    managed_asset_version: MANAGED_ASSET_VERSION,
    codex_config_sha256: config ? sha256(config) : 'missing'
  }));
}

function parseDoctorJson(text: string): any | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const start = trimmed.lastIndexOf('\n{');
  if (start >= 0) {
    try {
      return JSON.parse(trimmed.slice(start + 1));
    } catch {}
  }
  return null;
}

function reportFileFromArgs(args: string[]): string | null {
  const index = args.indexOf('--report-file');
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : null;
}

function extractRequiredBlockers(parsed: any, ok: boolean): string[] {
  if (ok) return [];
  const candidates = [
    parsed?.ready?.blockers,
    parsed?.ready?.repair_readiness?.blockers,
    parsed?.doctor_fix_postcheck?.required_blockers,
    parsed?.doctor_fix_postcheck?.blockers,
    parsed?.blockers
  ];
  for (const value of candidates) {
    if (Array.isArray(value) && value.length) return [...new Set(value.map(String).filter(Boolean))];
  }
  return [];
}

function extractOptionalWarnings(parsed: any): string[] {
  const candidates = [
    parsed?.ready?.warnings,
    parsed?.ready?.repair_readiness?.warnings,
    parsed?.doctor_fix_postcheck?.optional_warnings,
    parsed?.doctor_native_capability?.optional_warnings,
    parsed?.warnings
  ];
  return [...new Set(candidates.flatMap((value) => Array.isArray(value) ? value.map(String) : []).filter(Boolean))];
}

function tail(text: string, max = 4096): string {
  const raw = String(text || '');
  return raw.length <= max ? raw : raw.slice(raw.length - max);
}

import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, exists, globalSksRoot, nowIso, packageRoot, PACKAGE_VERSION, projectRoot, readJson, runProcess, which, writeJsonAtomic } from '../fsx.js';

export const UPDATE_MIGRATION_SCHEMA = 'sks.update-migration.v1' as const;

export interface PackageLocalDoctorRun {
  schema: 'sks.package-local-doctor-run.v1';
  ok: boolean;
  status: 'ok' | 'failed' | 'missing_entrypoint';
  entrypoint: string | null;
  cwd: string;
  args: string[];
  exit_code: number | null;
  parsed_ok: boolean | null;
  stdout_tail: string;
  stderr_tail: string;
  error: string | null;
}

export interface UpdateMigrationReceipt {
  schema: typeof UPDATE_MIGRATION_SCHEMA;
  status: 'current' | 'pending_project_receipt' | 'blocked' | 'skipped';
  sks_version: string;
  root: string;
  source: string;
  generated_at: string;
  pending_marker_path?: string | null;
  doctor?: PackageLocalDoctorRun | null;
  update_stages?: unknown[];
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
  'rollback'
]);

export function pendingUpdateMigrationPath(): string {
  return path.join(globalSksRoot(), 'update', 'pending-migration.json');
}

export function projectUpdateMigrationReceiptPath(root: string): string {
  return path.join(root, '.sneakoscope', 'update', 'migration-receipt.json');
}

export async function readPendingUpdateMigration(): Promise<UpdateMigrationReceipt | null> {
  return readJson<UpdateMigrationReceipt | null>(pendingUpdateMigrationPath(), null).catch(() => null);
}

export async function readProjectUpdateMigrationReceipt(root: string): Promise<UpdateMigrationReceipt | null> {
  return readJson<UpdateMigrationReceipt | null>(projectUpdateMigrationReceiptPath(root), null).catch(() => null);
}

export function isUpdateMigrationReceiptCurrent(receipt: UpdateMigrationReceipt | null | undefined): boolean {
  return receipt?.schema === UPDATE_MIGRATION_SCHEMA
    && receipt.status === 'current'
    && receipt.sks_version === PACKAGE_VERSION
    && Array.isArray(receipt.blockers)
    && receipt.blockers.length === 0;
}

export async function writePendingUpdateMigration(input: {
  source: string;
  doctor?: PackageLocalDoctorRun | null;
  blockers?: string[];
  warnings?: string[];
}): Promise<UpdateMigrationReceipt> {
  const pendingPath = pendingUpdateMigrationPath();
  const receipt: UpdateMigrationReceipt = {
    schema: UPDATE_MIGRATION_SCHEMA,
    status: 'pending_project_receipt',
    sks_version: PACKAGE_VERSION,
    root: globalSksRoot(),
    source: input.source,
    generated_at: nowIso(),
    pending_marker_path: pendingPath,
    doctor: input.doctor || null,
    blockers: input.blockers || [],
    warnings: input.warnings || []
  };
  await writeJsonAtomic(pendingPath, receipt);
  return receipt;
}

export async function clearPendingUpdateMigration(): Promise<void> {
  await fsp.rm(pendingUpdateMigrationPath(), { force: true }).catch(() => undefined);
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
  const receipt: UpdateMigrationReceipt = {
    schema: UPDATE_MIGRATION_SCHEMA,
    status: input.status || 'current',
    sks_version: PACKAGE_VERSION,
    root: input.root,
    source: input.source,
    generated_at: nowIso(),
    pending_marker_path: pendingUpdateMigrationPath(),
    doctor: input.doctor || null,
    update_stages: input.updateStages || [],
    blockers: input.blockers || [],
    warnings: input.warnings || []
  };
  await writeJsonAtomic(receiptPath, receipt);
  if (isUpdateMigrationReceiptCurrent(receipt)) await clearPendingUpdateMigration();
  return receipt;
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
  const pendingPath = pendingUpdateMigrationPath();
  const empty: Omit<UpdateMigrationGateResult, 'ok' | 'status' | 'receipt' | 'doctor' | 'blockers' | 'warnings'> = {
    schema: 'sks.update-migration-gate.v1',
    root,
    command,
    receipt_path: receiptPath,
    pending_marker_path: pendingPath
  };
  if (env.SKS_UPDATE_MIGRATION_GATE_DISABLED === '1') {
    return { ...empty, ok: true, status: 'skipped', receipt: null, doctor: null, blockers: [], warnings: ['gate_disabled_by_env'] };
  }
  if (ALLOWLIST_COMMANDS.has(command)) {
    return { ...empty, ok: true, status: 'skipped', receipt: null, doctor: null, blockers: [], warnings: [`allowlisted_command:${command}`] };
  }

  const [pending, receipt] = await Promise.all([
    readPendingUpdateMigration(),
    readProjectUpdateMigrationReceipt(root)
  ]);
  const requireReceipt = env.SKS_REQUIRE_UPDATE_MIGRATION_RECEIPT === '1';
  if (!pending && isUpdateMigrationReceiptCurrent(receipt) && !requireReceipt) {
    return { ...empty, ok: true, status: 'current', receipt, doctor: null, blockers: [], warnings: [] };
  }
  if (!pending && !requireReceipt) {
    return { ...empty, ok: true, status: 'skipped', receipt: receipt || null, doctor: null, blockers: [], warnings: ['no_pending_update_migration'] };
  }

  return withUpdateMigrationLock(root, empty, async () => {
    const doctor = await runPackageLocalDoctor({
      root,
      args: ['doctor', '--fix', '--json'],
      env: {
        ...env,
        SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
        SKS_DISABLE_UPDATE_CHECK: '1'
      },
      timeoutMs: 10 * 60 * 1000,
      maxOutputBytes: 128 * 1024
    });
    if (!doctor.ok) {
      const blocked = await writeProjectUpdateMigrationReceipt({
        root,
        source: 'first-command-gate',
        status: 'blocked',
        doctor,
        blockers: ['update_migration_doctor_failed'],
        warnings: pending?.warnings || []
      });
      return { ...empty, ok: false, status: 'blocked', receipt: blocked, doctor, blockers: ['update_migration_doctor_failed'], warnings: [] };
    }
    const current = await writeProjectUpdateMigrationReceipt({
      root,
      source: 'first-command-gate',
      doctor,
      blockers: [],
      warnings: pending?.warnings || []
    });
    return { ...empty, ok: true, status: 'repaired', receipt: current, doctor, blockers: [], warnings: [] };
  });
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
    args: ['doctor', '--fix', '--json'],
    env: {
      ...env,
      SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
      SKS_DISABLE_UPDATE_CHECK: '1',
      SKS_POSTINSTALL_NO_BOOTSTRAP: '1'
    },
    timeoutMs: 10 * 60 * 1000,
    maxOutputBytes: 128 * 1024
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
  const parsed = parseDoctorJson((result as any).stdout);
  const parsedOk = typeof parsed?.ok === 'boolean' ? parsed.ok : null;
  const ok = (result as any).code === 0 && parsedOk !== false;
  return {
    schema: 'sks.package-local-doctor-run.v1',
    ok,
    status: ok ? 'ok' : 'failed',
    entrypoint,
    cwd,
    args,
    exit_code: (result as any).code ?? null,
    parsed_ok: parsedOk,
    stdout_tail: tail((result as any).stdout || ''),
    stderr_tail: tail((result as any).stderr || ''),
    error: ok ? null : tail((result as any).stderr || (result as any).stdout || 'doctor failed')
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

async function withUpdateMigrationLock(
  root: string,
  base: Omit<UpdateMigrationGateResult, 'ok' | 'status' | 'receipt' | 'doctor' | 'blockers' | 'warnings'>,
  fn: () => Promise<UpdateMigrationGateResult>
): Promise<UpdateMigrationGateResult> {
  const lockPath = path.join(root, '.sneakoscope', 'update', 'migration.lock');
  await ensureDir(path.dirname(lockPath));
  let handle: fsp.FileHandle | null = null;
  try {
    handle = await fsp.open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, created_at: nowIso(), version: PACKAGE_VERSION }) + '\n', 'utf8');
    return await fn();
  } catch (err: any) {
    if (err?.code === 'EEXIST') {
      return { ...base, ok: false, status: 'blocked', receipt: null, doctor: null, blockers: ['update_migration_lock_held'], warnings: [] };
    }
    return { ...base, ok: false, status: 'blocked', receipt: null, doctor: null, blockers: [`update_migration_lock_error:${err?.message || String(err)}`], warnings: [] };
  } finally {
    await handle?.close().catch(() => undefined);
    if (handle) await fsp.rm(lockPath, { force: true }).catch(() => undefined);
  }
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

function tail(text: string, max = 4096): string {
  const raw = String(text || '');
  return raw.length <= max ? raw : raw.slice(raw.length - max);
}

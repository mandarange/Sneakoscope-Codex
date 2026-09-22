import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../fsx.js';
import { inspectConfinedPath, ManagedPathSafetyError } from '../../managed-path-safety.js';

const RUNTIME_DIRNAME = 'local-decision';
const MAX_MARKER_BYTES = 256 * 1024;

export interface RetiredLocalDecisionCleanup {
  ok: boolean;
  actions: string[];
  blockers: string[];
  warnings: string[];
  detail: {
    runtime_root: string;
    removed_runtime: boolean;
    removed_socket_dir: boolean;
    stopped_worker: boolean;
  };
}

export async function runRetiredLocalDecisionStage(
  env: NodeJS.ProcessEnv = process.env
): Promise<{
  ok: boolean;
  status: 'ok' | 'failed';
  actions: string[];
  blockers: string[];
  warnings: string[];
  detail: RetiredLocalDecisionCleanup['detail'];
}> {
  const cleanup = await removeRetiredLocalDecisionRuntime(env);
  return {
    ok: cleanup.ok,
    status: cleanup.ok ? 'ok' : 'failed',
    actions: cleanup.actions,
    blockers: cleanup.blockers,
    warnings: cleanup.warnings,
    detail: cleanup.detail
  };
}

export async function removeRetiredLocalDecisionRuntime(
  env: NodeJS.ProcessEnv = process.env,
  opts: { socketDir?: string } = {}
): Promise<RetiredLocalDecisionCleanup> {
  const sksHome = path.resolve(env.SKS_HOME || path.join(env.HOME || os.homedir(), '.sneakoscope'));
  const runtimeRoot = path.join(sksHome, RUNTIME_DIRNAME);
  const actions: string[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const detail = {
    runtime_root: runtimeRoot,
    removed_runtime: false,
    removed_socket_dir: false,
    stopped_worker: false
  };
  if (sksHome === path.parse(sksHome).root) {
    blockers.push('retired_local_decision_home_root_refused');
    return { ok: false, actions, blockers, warnings, detail };
  }

  const stopped = await stopRecordedWorker(runtimeRoot).catch(() => 'unreadable' as const);
  if (stopped === 'stopped') {
    detail.stopped_worker = true;
    actions.push('stopped_retired_local_decision_worker');
  } else if (stopped === 'not_ours') {
    warnings.push('retired_local_decision_worker_pid_not_owned');
  }

  const removedDefault = await removeConfinedTree(sksHome, runtimeRoot);
  if (removedDefault === 'removed') {
    detail.removed_runtime = true;
    actions.push('removed_retired_local_decision_runtime');
  } else if (removedDefault === 'absent') {
    actions.push('retired_local_decision_runtime_absent');
  } else {
    blockers.push(`retired_local_decision_runtime_${removedDefault}`);
  }

  const explicit = explicitRuntimeRoot(env, runtimeRoot);
  if (explicit) {
    const removedExplicit = await removeMarkedExplicitRoot(explicit);
    if (removedExplicit === 'removed') actions.push('removed_explicit_retired_local_decision_root');
    else if (removedExplicit === 'preserved') warnings.push('retired_local_decision_explicit_root_preserved');
    else if (removedExplicit !== 'absent') blockers.push(`retired_local_decision_explicit_root_${removedExplicit}`);
  }

  const socketDir = opts.socketDir || defaultSocketDir();
  const removedSocket = await removeSocketDir(socketDir, Boolean(opts.socketDir));
  if (removedSocket === 'removed') {
    detail.removed_socket_dir = true;
    actions.push('removed_retired_local_decision_socket_dir');
  } else if (removedSocket !== 'absent') {
    blockers.push(`retired_local_decision_socket_${removedSocket}`);
  }

  return { ok: blockers.length === 0, actions, blockers, warnings, detail };
}

function explicitRuntimeRoot(env: NodeJS.ProcessEnv, defaultRoot: string): string | null {
  const raw = String(env.SKS_LOCAL_DECISION_ROOT || '').trim();
  if (!raw) return null;
  const resolved = path.resolve(raw);
  if (resolved === defaultRoot) return null;
  return resolved;
}

async function removeMarkedExplicitRoot(target: string): Promise<'removed' | 'absent' | 'preserved' | 'refused'> {
  const parent = path.dirname(target);
  if (parent === target || parent === path.parse(parent).root) return 'preserved';
  const marked = await isRetiredRuntimeMarker(target);
  if (marked === 'absent') return 'absent';
  if (marked !== 'marked') return 'preserved';
  return removeConfinedTree(parent, target);
}

async function isRetiredRuntimeMarker(root: string): Promise<'marked' | 'absent' | 'unmarked'> {
  const configPath = path.join(root, 'config.json');
  const receiptPath = path.join(root, 'install-receipt.json');
  const configStat = await fsp.lstat(configPath).catch(() => null);
  const receiptStat = await fsp.lstat(receiptPath).catch(() => null);
  if (!configStat && !receiptStat) return 'absent';
  if (!configStat?.isFile() || configStat.isSymbolicLink() || !receiptStat?.isFile() || receiptStat.isSymbolicLink()) return 'unmarked';
  if (configStat.size > MAX_MARKER_BYTES || receiptStat.size > MAX_MARKER_BYTES) return 'unmarked';
  try {
    const config = JSON.parse(await fsp.readFile(configPath, 'utf8')) as { schemaVersion?: unknown };
    if (config.schemaVersion !== 1) return 'unmarked';
    return 'marked';
  } catch {
    return 'unmarked';
  }
}

async function removeConfinedTree(boundary: string, target: string): Promise<'removed' | 'absent' | 'refused'> {
  try {
    const inspected = await inspectConfinedPath(boundary, target);
    if (!inspected.exists) return 'absent';
    await removeExistingTree(inspected.path);
    const after = await inspectConfinedPath(boundary, target);
    return after.exists ? 'refused' : 'removed';
  } catch (error: unknown) {
    if (error instanceof ManagedPathSafetyError) return 'refused';
    return 'refused';
  }
}

async function removeSocketDir(socketDir: string, trustedParent: boolean): Promise<'removed' | 'absent' | 'refused'> {
  const resolved = path.resolve(socketDir);
  const parent = path.dirname(resolved);
  const name = path.basename(resolved);
  if (!/^sks-ld-\d+$/.test(name)) return 'refused';
  const stat = await fsp.lstat(resolved).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!stat) return 'absent';
  if (stat.isSymbolicLink() || !stat.isDirectory()) return 'refused';
  if (!trustedParent && !(await parentIsTemp(parent))) return 'refused';
  await removeExistingTree(resolved);
  return 'removed';
}

async function parentIsTemp(parent: string): Promise<boolean> {
  const parentReal = await fsp.realpath(parent).catch(() => null);
  const tempReal = await fsp.realpath('/tmp').catch(() => null);
  return Boolean(parentReal && tempReal && parentReal === tempReal);
}

async function removeExistingTree(target: string): Promise<void> {
  await fsp.rm(target, { recursive: true, force: false });
}

function defaultSocketDir(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const base = process.platform === 'win32' ? os.tmpdir() : '/tmp';
  return path.join(base, `sks-ld-${uid}`);
}

async function stopRecordedWorker(runtimeRoot: string): Promise<'absent' | 'stopped' | 'not_ours' | 'unreadable'> {
  const file = path.join(runtimeRoot, 'runtime', 'service.json');
  const stat = await fsp.lstat(file).catch(() => null);
  if (!stat) return 'absent';
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MARKER_BYTES) return 'unreadable';
  let pid: number | null = null;
  try {
    const parsed = JSON.parse(await fsp.readFile(file, 'utf8')) as { pid?: unknown };
    pid = typeof parsed.pid === 'number' && Number.isInteger(parsed.pid) ? parsed.pid : null;
  } catch {
    return 'unreadable';
  }
  if (!pid || pid === process.pid || pid <= 1) return 'unreadable';
  const command = await processCommand(pid);
  if (!command) return 'absent';
  if (!command.includes('sks_local_decision')) return 'not_ours';
  if (!signal(pid, 'SIGTERM')) return 'absent';
  return 'stopped';
}

async function processCommand(pid: number): Promise<string | null> {
  const result = await runProcess('ps', ['-p', String(pid), '-o', 'command='], {
    timeoutMs: 2_000,
    maxOutputBytes: 16 * 1024
  }).catch(() => null);
  if (!result || result.code !== 0) return null;
  return String(result.stdout || '').trim() || null;
}

function signal(pid: number, sig: NodeJS.Signals): boolean {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
}

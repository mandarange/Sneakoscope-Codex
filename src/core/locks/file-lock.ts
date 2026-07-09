import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, nowIso, randomId, readJson, writeJsonAtomic } from '../fsx.js';
import { guardedRm, guardContextForRoute } from '../safety/mutation-guard.js';
import { CONFIRMATION_REQUIRED, REQUESTED_SCOPE_CONTRACT_SCHEMA, type RequestedScopeContract } from '../safety/requested-scope-contract.js';

export interface FileLockInput {
  lockPath: string;
  timeoutMs: number;
  staleMs: number;
}

interface FileLockOwner {
  schema: 'sks.file-lock-owner.v1';
  owner: string;
  pid: number;
  hostname: string;
  acquired_at: string;
  heartbeat_at: string;
  stale_ms: number;
}

const HEARTBEAT_MARGIN = 3;

export async function withFileLock<T>(input: FileLockInput, fn: () => Promise<T>): Promise<T> {
  const lockPath = path.resolve(input.lockPath);
  const timeoutMs = Math.max(1, input.timeoutMs);
  const staleMs = Math.max(1, input.staleMs);
  const started = Date.now();
  const owner = `${process.pid}-${randomId(8)}`;
  await ensureDir(path.dirname(lockPath));

  while (true) {
    try {
      await fsp.mkdir(lockPath);
      await writeOwnerFile(lockPath, owner, staleMs);
      break;
    } catch (err: unknown) {
      const code = errorCode(err);
      if (code !== 'EEXIST') throw err;
      await recoverStaleLock(lockPath);
      if (Date.now() - started > timeoutMs) {
        throw new Error(`file_lock_timeout:${lockPath}`);
      }
      await sleep(jitterDelay());
    }
  }

  // Touch the owner file's heartbeat_at while we hold the lock so a stale
  // waiter never mistakes genuinely slow-but-alive work for an abandoned
  // lock (20차 P1-1) — recoverStaleLock only reclaims when both the
  // heartbeat is old AND the owning pid is actually dead.
  const heartbeat = setInterval(() => {
    /* intentional: a missed heartbeat tick just gets retried next interval; only matters if it stays stale for the full staleMs window */
    writeOwnerFile(lockPath, owner, staleMs).catch(() => undefined);
  }, Math.max(250, Math.floor(staleMs / HEARTBEAT_MARGIN)));
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    /* intentional: best-effort release — if it fails, the lock will still be reclaimed once it goes stale (owner-token/pid checked, never blind rm) */
    await releaseIfOwned(lockPath, owner).catch(() => undefined);
  }
}

async function writeOwnerFile(lockPath: string, owner: string, staleMs: number): Promise<void> {
  const now = nowIso();
  const existing = await readJson<FileLockOwner | null>(path.join(lockPath, 'owner.json'), null);
  await writeJsonAtomic(path.join(lockPath, 'owner.json'), {
    schema: 'sks.file-lock-owner.v1',
    owner,
    pid: process.pid,
    hostname: os.hostname(),
    acquired_at: existing?.owner === owner ? existing.acquired_at : now,
    heartbeat_at: now,
    stale_ms: staleMs
  } satisfies FileLockOwner);
}

// Reclaims an abandoned lock without ever directly deleting a lock another
// process might still legitimately hold. A dead-or-expired lock is renamed
// (a single atomic syscall) into a quarantine directory first; only the one
// waiter whose rename succeeds proceeds to retry acquisition, so two
// concurrent waiters can never both believe they reclaimed the same lock
// (the previous mtime-only check + direct rm -rf allowed exactly that).
async function recoverStaleLock(lockPath: string): Promise<void> {
  const ownerPath = path.join(lockPath, 'owner.json');
  const info = await readJson<FileLockOwner | null>(ownerPath, null);
  let stale: boolean;
  if (!info || typeof info.pid !== 'number' || !info.heartbeat_at) {
    // No readable owner record: fall back to directory mtime so a lock left
    // over from before this format existed can still be reclaimed.
    stale = await isDirMtimeStale(lockPath, Math.max(1, info?.stale_ms || 30_000));
  } else {
    const heartbeatAgeMs = Date.now() - Date.parse(info.heartbeat_at);
    stale = Number.isFinite(heartbeatAgeMs)
      && heartbeatAgeMs > info.stale_ms
      && !isPidAlive(info.pid, info.hostname);
  }
  if (!stale) return;
  const quarantinePath = `${lockPath}.stale-${Date.now()}-${randomId(6)}`;
  try {
    await fsp.rename(lockPath, quarantinePath);
  } catch {
    // Another waiter already reclaimed (or the holder released) it first.
    return;
  }
  /* intentional: the quarantine rename already reclaimed the lock name; this is just disk cleanup of the orphaned directory and can be swept up later if it fails */
  await guardedRm(guardContextForRoute(process.cwd(), lockScopeContract(quarantinePath), 'remove quarantined stale SKS file lock directory'), quarantinePath, {
    recursive: true,
    force: true
  }).catch(() => undefined);
}

async function releaseIfOwned(lockPath: string, owner: string): Promise<void> {
  const info = await readJson<FileLockOwner | null>(path.join(lockPath, 'owner.json'), null);
  // If the owner record is missing or names a different owner, this lock was
  // already reclaimed as stale out from under us — removing it now would
  // delete whoever holds it legitimately next.
  if (info && info.owner !== owner) return;
  await removeLockDir(lockPath);
}

async function removeLockDir(lockPath: string): Promise<void> {
  await guardedRm(guardContextForRoute(process.cwd(), lockScopeContract(lockPath), 'remove SKS file lock directory'), lockPath, {
    recursive: true,
    force: true
  });
}

function isPidAlive(pid: number, hostname: string): boolean {
  // A pid recorded on a different host can't be liveness-checked locally;
  // treat it as alive (never force-reclaim across hosts from mtime alone).
  if (hostname && hostname !== os.hostname()) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return errorCode(err) !== 'ESRCH';
  }
}

async function isDirMtimeStale(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const stat = await fsp.stat(lockPath);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function lockScopeContract(lockPath: string): RequestedScopeContract {
  const resolved = path.resolve(lockPath);
  return {
    schema: REQUESTED_SCOPE_CONTRACT_SCHEMA,
    route: 'internal:file-lock',
    user_request: 'Remove only the current SKS file-lock directory.',
    allowed_mutations: {
      project_files: true,
      global_codex_config: false,
      codex_app_process: false,
      codex_lb_auth: false,
      package_install: false,
      zellij_install: false,
      network: false,
      skill_snapshot_promotion: false
    },
    allowed_paths: [resolved, `${resolved}/**`],
    forbidden_paths: ['~/.codex/config.toml', '/Applications/**'],
    requires_explicit_confirmation: [...CONFIRMATION_REQUIRED]
  };
}

function jitterDelay(): number {
  return 15 + Math.floor(Math.random() * 45);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
}

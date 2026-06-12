import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, nowIso, randomId, writeJsonAtomic } from '../fsx.js';
import { guardedRm, guardContextForRoute } from '../safety/mutation-guard.js';
import { CONFIRMATION_REQUIRED, REQUESTED_SCOPE_CONTRACT_SCHEMA, type RequestedScopeContract } from '../safety/requested-scope-contract.js';

export interface FileLockInput {
  lockPath: string;
  timeoutMs: number;
  staleMs: number;
}

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
      await writeJsonAtomic(path.join(lockPath, 'owner.json'), {
        schema: 'sks.file-lock-owner.v1',
        owner,
        pid: process.pid,
        acquired_at: nowIso(),
        stale_ms: staleMs
      });
      break;
    } catch (err: unknown) {
      const code = errorCode(err);
      if (code !== 'EEXIST') throw err;
      await recoverStaleLock(lockPath, staleMs);
      if (Date.now() - started > timeoutMs) {
        throw new Error(`file_lock_timeout:${lockPath}`);
      }
      await sleep(jitterDelay());
    }
  }

  try {
    return await fn();
  } finally {
    await removeLockDir(lockPath).catch(() => undefined);
  }
}

async function recoverStaleLock(lockPath: string, staleMs: number): Promise<void> {
  try {
    const stat = await fsp.stat(lockPath);
    if (Date.now() - stat.mtimeMs > staleMs) {
      await removeLockDir(lockPath);
    }
  } catch {}
}

async function removeLockDir(lockPath: string): Promise<void> {
  await guardedRm(guardContextForRoute(process.cwd(), lockScopeContract(lockPath), 'remove SKS file lock directory'), lockPath, {
    recursive: true,
    force: true
  });
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

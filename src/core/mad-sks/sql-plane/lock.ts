import path from 'node:path';
import { ensureDir } from '../../fsx.js';
import { withFileLock } from '../../locks/file-lock.js';
import { madSksSqlPlaneRuntimeDir } from './paths.js';

// Previously a bespoke mkdir-lock with no owner-pid check and no stale
// recovery at all — a crash mid-operation left the lock permanently stuck
// (20차 P1-3). Reuses the single owner-token + heartbeat + quarantine-reclaim
// lock implementation from core/locks/file-lock.ts instead of a second one.
export async function withMadSksSqlPlaneLock<T>(root: string, missionId: string, name: string, fn: () => Promise<T>): Promise<T> {
  const dir = path.join(madSksSqlPlaneRuntimeDir(root, missionId), 'locks');
  await ensureDir(dir);
  const lockPath = path.join(dir, `${safeName(name)}.lock`);
  return withFileLock({ lockPath, timeoutMs: 15_000, staleMs: 60_000 }, fn);
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 80) || 'lock';
}

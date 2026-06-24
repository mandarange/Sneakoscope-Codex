import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic } from '../fsx.js';
import { missionDir } from '../mission.js';

export async function withMadDbLock<T>(root: string, missionId: string, name: string, fn: () => Promise<T>): Promise<T> {
  const dir = path.join(missionDir(root, missionId), 'mad-db', 'runtime', 'locks');
  await ensureDir(dir);
  const lockDir = path.join(dir, `${safeName(name)}.lock`);
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      await fs.mkdir(lockDir);
      await writeJsonAtomic(path.join(lockDir, 'owner.json'), {
        schema: 'sks.mad-db-lock.v1',
        pid: process.pid,
        name,
        acquired_at: nowIso()
      });
      break;
    } catch (err: unknown) {
      if (Date.now() > deadline) throw new Error(`mad_db_lock_timeout:${name}`);
      await sleep(25 + Math.floor(Math.random() * 25));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lockDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 80) || 'lock';
}

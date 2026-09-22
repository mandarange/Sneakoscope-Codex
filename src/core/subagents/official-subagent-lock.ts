import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { withFileLock } from '../locks/file-lock.js';

export const OFFICIAL_SUBAGENT_LIFECYCLE_LOCK = '.subagent-evidence.lock';

const lockStore = new AsyncLocalStorage<true>();

export function officialSubagentLifecycleLockHeld(): boolean {
  return lockStore.getStore() === true;
}

export function withOfficialSubagentLifecycleLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  return withFileLock({
    lockPath: path.join(dir, OFFICIAL_SUBAGENT_LIFECYCLE_LOCK),
    timeoutMs: 5_000,
    staleMs: 60_000
  }, () => lockStore.run(true, fn));
}

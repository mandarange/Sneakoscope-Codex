import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { withFileLock } from '../file-lock.js';

async function tempRoot() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'sks-file-lock-'));
}

test('withFileLock: concurrent acquirers never overlap (single process, 10 workers x 20 rounds)', async () => {
  const root = await tempRoot();
  const lockPath = path.join(root, 'contended.lock');
  const counterPath = path.join(root, 'counter.json');
  await fsp.writeFile(counterPath, JSON.stringify({ value: 0, holders: 0, doubleHolder: false }));

  const worker = async () => {
    for (let round = 0; round < 20; round += 1) {
      await withFileLock({ lockPath, timeoutMs: 15_000, staleMs: 2_000 }, async () => {
        const state = JSON.parse(await fsp.readFile(counterPath, 'utf8'));
        state.holders += 1;
        if (state.holders > 1) state.doubleHolder = true;
        await fsp.writeFile(counterPath, JSON.stringify(state));
        // Yield without blocking the event loop, to give a real chance for
        // a second acquirer to race in if the lock is broken.
        await new Promise((resolve) => setTimeout(resolve, 1 + Math.floor(Math.random() * 4)));
        const after = JSON.parse(await fsp.readFile(counterPath, 'utf8'));
        after.value += 1;
        after.holders -= 1;
        await fsp.writeFile(counterPath, JSON.stringify(after));
      });
    }
  };

  await Promise.all(Array.from({ length: 10 }, () => worker()));

  const final = JSON.parse(await fsp.readFile(counterPath, 'utf8'));
  assert.equal(final.doubleHolder, false, 'no two acquirers should ever have held the lock simultaneously');
  assert.equal(final.value, 200, 'every critical section should have run to completion exactly once');
  assert.equal(final.holders, 0);
});

test('withFileLock: a lock whose holder crashed (heartbeat stale, pid dead) is reclaimed, not deadlocked forever', async () => {
  const root = await tempRoot();
  const lockPath = path.join(root, 'crashed.lock');
  await fsp.mkdir(lockPath);
  // Simulate a holder that acquired the lock and then crashed: a pid that
  // cannot possibly be alive, with a heartbeat already older than staleMs.
  await fsp.writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({
    schema: 'sks.file-lock-owner.v1',
    owner: 'dead-owner',
    pid: 999999,
    hostname: os.hostname(),
    acquired_at: new Date(Date.now() - 10_000).toISOString(),
    heartbeat_at: new Date(Date.now() - 10_000).toISOString(),
    stale_ms: 500
  }));

  const result = await withFileLock({ lockPath, timeoutMs: 5_000, staleMs: 500 }, async () => 'reclaimed');
  assert.equal(result, 'reclaimed');
});

test('withFileLock: release only removes the lock if still owned (stolen lock is left alone)', async () => {
  const root = await tempRoot();
  const lockPath = path.join(root, 'stolen.lock');

  let sawIntermediateState: boolean | null = null;
  await withFileLock({ lockPath, timeoutMs: 5_000, staleMs: 60_000 }, async () => {
    // Simulate this lock having been reclaimed out from under the current
    // holder (owner.json now names someone else) before release runs.
    await fsp.writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({
      schema: 'sks.file-lock-owner.v1',
      owner: 'someone-else',
      pid: process.pid,
      hostname: os.hostname(),
      acquired_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      stale_ms: 60_000
    }));
    sawIntermediateState = true;
  });

  assert.equal(sawIntermediateState, true);
  const stillExists = await fsp.stat(lockPath).then(() => true).catch(() => false);
  assert.equal(stillExists, true, 'release must not delete a lock now owned by someone else');
  const owner = JSON.parse(await fsp.readFile(path.join(lockPath, 'owner.json'), 'utf8'));
  assert.equal(owner.owner, 'someone-else');
});

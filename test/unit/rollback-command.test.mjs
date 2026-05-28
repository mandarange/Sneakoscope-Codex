import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('rollback command gate supports dry-run, apply, queue status, and summary proof', () => {
  const run = spawnSync(process.execPath, ['scripts/agent-rollback-command-check.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' },
    timeout: 60_000
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});

import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('hooks managed install fixture script passes', () => {
  const run = spawnSync(process.execPath, ['scripts/hooks-managed-install-fixture-check.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.ok, true);
});

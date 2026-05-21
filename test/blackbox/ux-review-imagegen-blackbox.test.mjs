import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('UX review fake imagegen blackbox produces artifact graph without real claims', () => {
  const run = spawnSync(process.execPath, ['scripts/ux-review-imagegen-blackbox-check.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.response.real_generated, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed legacy no-subagent-scaling gate redirects to the official subagent workflow check', () => {
  const result = spawnSync(process.execPath, ['./dist/scripts/official-subagent-workflow-check.js'], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

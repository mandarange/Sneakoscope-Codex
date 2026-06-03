import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed blackbox proves pending queue drain', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-dynamic-pool-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

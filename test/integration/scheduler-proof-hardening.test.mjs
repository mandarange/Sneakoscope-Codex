import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('scheduler proof hardening gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-scheduler-proof-hardening-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

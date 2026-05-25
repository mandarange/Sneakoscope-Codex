import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('scheduler proof blocks starvation and records drain counters', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-scheduler-proof-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

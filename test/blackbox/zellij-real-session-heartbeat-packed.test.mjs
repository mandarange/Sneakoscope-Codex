import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('packed zellij real-session-heartbeat gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/zellij-real-session-heartbeat-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

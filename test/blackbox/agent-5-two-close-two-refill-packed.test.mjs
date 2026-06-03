import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed blackbox proves two replacement sessions after two early closes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-backfill-replenishment-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

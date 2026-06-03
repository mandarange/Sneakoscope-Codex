import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('scheduler backfill invariants gate passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-backfill-replenishment-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

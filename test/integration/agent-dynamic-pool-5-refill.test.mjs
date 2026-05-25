import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('5 active slots refill after early completions', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-backfill-replenishment-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('agent route keeps 5 active slots across 8 work items', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-backfill-route-blackbox.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('team route backfill fixture passes', () => {
  const result = spawnSync(process.execPath, ['scripts/team-backfill-route-blackbox.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

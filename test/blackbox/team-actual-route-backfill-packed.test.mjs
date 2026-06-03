import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('packed team actual route backfill passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/team-actual-route-backfill-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

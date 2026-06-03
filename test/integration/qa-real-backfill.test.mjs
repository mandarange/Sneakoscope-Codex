import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('qa route backfill fixture passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/qa-backfill-route-blackbox.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

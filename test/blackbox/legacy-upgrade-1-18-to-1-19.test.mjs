import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('historical 1.18.x upgrade state passes the canonical migration safety gate', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/legacy-upgrade-matrix-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

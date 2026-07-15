import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('historical 1.18.x/1.19.x upgrade states pass the canonical migration safety gate', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/current-upgrade-matrix-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

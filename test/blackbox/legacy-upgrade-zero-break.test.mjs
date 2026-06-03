import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('legacy 1.18.x/1.19.x -> 1.20.1 upgrade-zero-break gate passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/legacy-upgrade-matrix-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

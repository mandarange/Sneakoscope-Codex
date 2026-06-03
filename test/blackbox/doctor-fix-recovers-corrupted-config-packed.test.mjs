import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed doctor --fix recovers-corrupted-config gate passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/doctor-fix-recovers-corrupted-config-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

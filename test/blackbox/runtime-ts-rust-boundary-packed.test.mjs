import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed runtime-ts-rust-boundary gate passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/runtime-ts-rust-boundary-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed packlist performance gate passes (file count, size, forbidden files)', () => {
  // Run the gate directly; it inherits npm_execpath from the test runner env
  // (set when invoked via `npm run test:blackbox`) and otherwise falls back to `npm`.
  const result = spawnSync(process.execPath, ['dist/scripts/packlist-performance-check.js'], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

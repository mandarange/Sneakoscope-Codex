import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed MAD-SKS Fast mode propagation gate passes', () => {
  const result = spawnSync('npm', ['run', 'mad-sks:fast-mode-propagation', '--silent'], {
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

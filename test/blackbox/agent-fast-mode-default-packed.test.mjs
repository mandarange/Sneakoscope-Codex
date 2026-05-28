import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed Fast mode default gate passes', () => {
  const result = spawnSync('npm', ['run', 'agent:fast-mode-default', '--silent'], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed native CLI session swarm gate passes', () => {
  const result = spawnSync('npm', ['run', 'agent:native-cli-session-swarm', '--silent'], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

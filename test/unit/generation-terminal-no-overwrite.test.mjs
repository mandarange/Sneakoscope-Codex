import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('terminal generation artifacts do not overwrite across generations', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-terminal-generations-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

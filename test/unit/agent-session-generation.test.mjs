import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('session generations are immutable per slot generation', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-session-generation-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

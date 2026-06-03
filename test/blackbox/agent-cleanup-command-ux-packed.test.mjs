import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed cleanup command UX gate passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-cleanup-command-ux-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

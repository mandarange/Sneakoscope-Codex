import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('tmux lane supervisor persists until drain', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-tmux-lane-persistence-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

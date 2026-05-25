import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('tmux lane does not flicker between generations', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-tmux-lane-no-flicker-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

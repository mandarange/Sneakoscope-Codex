import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('tmux right lanes require pane launch evidence', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-tmux-real-right-lanes-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

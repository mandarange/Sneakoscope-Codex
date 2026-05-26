import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('orchestrator initializes, updates, verifies, and drains tmux supervisor', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-tmux-supervisor-integrated-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

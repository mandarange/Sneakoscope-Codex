import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('agent proof reconciles CLI, task graph, work queue, scheduler, terminal, and tmux evidence', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-proof-contract-reconciled-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

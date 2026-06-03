import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('agent proof reconciles CLI, task graph, work queue, scheduler, terminal, and tmux evidence', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-proof-contract-reconciled-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

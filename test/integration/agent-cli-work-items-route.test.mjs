import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('agent route work item CLI options reach the runtime route graph', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-cli-options-to-task-graph-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

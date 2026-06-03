import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('orchestrator propagates CLI work item options into proof artifacts', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-cli-options-to-task-graph-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

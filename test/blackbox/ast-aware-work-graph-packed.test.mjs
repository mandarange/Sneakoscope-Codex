import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed AST-aware work graph gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-ast-aware-work-graph-check.mjs'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 4 });
  assert.equal(result.status, 0, result.stderr);
});

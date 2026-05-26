import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('intelligent work graph release gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-intelligent-work-graph-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

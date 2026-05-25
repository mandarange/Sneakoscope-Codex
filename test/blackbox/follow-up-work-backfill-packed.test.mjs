import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('follow-up work item enqueue creates a new generation', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-follow-up-work-schema-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

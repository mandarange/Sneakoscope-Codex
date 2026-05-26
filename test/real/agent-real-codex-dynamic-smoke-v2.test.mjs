import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('real codex dynamic smoke v2 is honest optional by default', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-real-codex-dynamic-smoke-check.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, SKS_TEST_REAL_DYNAMIC_AGENTS: '' },
    maxBuffer: 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr);
});

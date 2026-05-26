import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('real tmux physical proof v2 is honest optional by default', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-real-tmux-physical-proof-check.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, SKS_TEST_REAL_TMUX: '' },
    maxBuffer: 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr);
});

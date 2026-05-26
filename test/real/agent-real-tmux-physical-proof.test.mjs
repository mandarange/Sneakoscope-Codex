import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('real tmux physical proof smoke is pass or integration_optional', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-real-tmux-physical-proof-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

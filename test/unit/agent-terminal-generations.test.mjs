import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('terminal artifacts are generation-aware', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-terminal-generations-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

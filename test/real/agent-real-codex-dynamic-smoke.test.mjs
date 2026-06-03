import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('real codex dynamic smoke is pass or integration_optional', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-real-codex-dynamic-smoke-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

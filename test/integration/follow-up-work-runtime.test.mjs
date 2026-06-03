import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('follow-up work runtime fixture passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-follow-up-work-schema-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

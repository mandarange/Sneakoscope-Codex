import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed multi-project isolation check passes', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-multi-project-isolation-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(result.status, 0);
});

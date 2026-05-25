import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('agent janitor writes proof-bound cleanup report', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-janitor-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.agent-janitor-check.v1');
  assert.deepEqual(json.issues, []);
  assert.equal(result.status, 0);
});

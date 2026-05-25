import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('project session namespace isolates same mission id across project roots', () => {
  const result = spawnSync(process.execPath, ['scripts/agent-multi-project-isolation-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.agent-multi-project-isolation-check.v1');
  assert.deepEqual(json.issues, []);
  assert.equal(result.status, 0);
});

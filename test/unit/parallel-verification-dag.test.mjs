import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('parallel verification engine rejects output conflicts and runs a fixture DAG', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/parallel-verification-engine-check.js'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.parallel-verification-engine-check.v1');
  assert.deepEqual(json.issues, []);
  assert.equal(result.status, 0);
});

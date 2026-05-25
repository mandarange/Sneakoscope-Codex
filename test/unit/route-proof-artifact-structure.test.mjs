import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('route proof artifact structure gate blocks shallow agent proof', () => {
  const result = spawnSync(process.execPath, ['scripts/route-proof-artifact-structure-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.route-proof-artifact-structure-check.v1');
  assert.deepEqual(json.issues, []);
  assert.equal(result.status, 0);
});

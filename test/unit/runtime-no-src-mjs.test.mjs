import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('runtime:no-src-mjs rejects source runtime shadows', () => {
  const result = spawnSync(process.execPath, ['scripts/runtime-no-src-mjs-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.runtime-no-src-mjs.v1');
  assert.equal(json.src_mjs_runtime_files, 0);
  assert.equal(result.status, 0);
});

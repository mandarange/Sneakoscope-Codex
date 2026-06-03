import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('runtime:dist-parity validates manifest source digest and compiled counts', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/runtime-dist-parity-check.js'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.runtime-dist-parity.v1');
  assert.equal(json.src_mjs_runtime_files, 0);
  assert.equal(json.dist_mjs_runtime_files, 0);
  assert.equal(result.status, 0);
});

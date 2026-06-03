import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed runtime source check has no src mjs shadows', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/runtime-no-src-mjs-check.js'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(result.status, 0);
});

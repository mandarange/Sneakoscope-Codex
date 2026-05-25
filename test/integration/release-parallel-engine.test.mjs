import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('release parallel engine script is wired into package metadata', () => {
  const result = spawnSync(process.execPath, ['scripts/release-metadata-1-17-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.gate, 'release:metadata');
  assert.equal(result.status, 0);
});

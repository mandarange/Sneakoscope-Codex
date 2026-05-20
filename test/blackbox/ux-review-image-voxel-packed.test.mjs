import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('UX-Review Image Voxel relation fixture validates', () => {
  const result = spawnSync(process.execPath, ['scripts/ux-review-image-voxel-relations-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

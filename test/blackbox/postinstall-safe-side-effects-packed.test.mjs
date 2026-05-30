import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed postinstall-safe-side-effects gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/postinstall-safe-side-effects-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

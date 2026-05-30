import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('packed core-skill heldout-validation gate passes', () => {
  const r = spawnSync(process.execPath, ['scripts/core-skill-heldout-validation-check.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

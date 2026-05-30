import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('packed core-skill no-inference-optimizer gate passes', () => {
  const r = spawnSync(process.execPath, ['scripts/core-skill-no-inference-optimizer-check.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

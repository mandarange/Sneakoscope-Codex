import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('packed core-skill card-schema gate passes', () => {
  const r = spawnSync(process.execPath, ['dist/scripts/core-skill-card-schema-check.js'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

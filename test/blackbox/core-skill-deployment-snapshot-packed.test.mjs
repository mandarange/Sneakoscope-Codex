import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('packed core-skill deployment-snapshot gate passes', () => {
  const r = spawnSync(process.execPath, ['dist/scripts/core-skill-deployment-snapshot-check.js'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

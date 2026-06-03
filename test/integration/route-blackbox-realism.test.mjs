import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('route blackbox realism release gate passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/route-blackbox-realism-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

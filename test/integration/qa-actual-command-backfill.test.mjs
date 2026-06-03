import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('qa backfill gate invokes actual qa-loop command', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/qa-actual-route-backfill-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

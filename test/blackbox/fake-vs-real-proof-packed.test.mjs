import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed fake-vs-real proof gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/fake-vs-real-proof-policy-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

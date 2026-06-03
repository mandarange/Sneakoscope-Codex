import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('fake-real proof separation release gate passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/fake-vs-real-proof-policy-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('mutation callsite coverage gate passes: every risky mutation is guarded or allowlisted', () => {
  const result = spawnSync(process.execPath, ['scripts/mutation-callsite-coverage-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true, result.stdout);
  assert.equal(result.status, 0);
  assert.equal(json.gate, 'safety:mutation-callsite-coverage');
  // The two global package installs must be proven guarded (not just allowlisted).
  assert.ok(json.covered >= 2, `expected >=2 guarded sites, got ${json.covered}`);
  assert.equal(json.uncovered, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('core-skill route-runtime-integration gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/core-skill-route-runtime-integration-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true, result.stdout + result.stderr);
  assert.equal(result.status, 0);
  assert.equal(json.gate, 'core-skill:route-runtime-integration');
  assert.equal(json.deployed_selected, true);
  assert.equal(json.fallback_graceful, true);
});

test('core-skill promotion-side-effect-ledger gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/core-skill-promotion-side-effect-ledger-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true, result.stdout + result.stderr);
  assert.equal(result.status, 0);
  assert.equal(json.gate, 'core-skill:promotion-side-effect-ledger');
  assert.ok(json.promotions >= 2);
  assert.equal(json.rollback_pointer, true);
  assert.equal(json.two_arg_safe, true);
});

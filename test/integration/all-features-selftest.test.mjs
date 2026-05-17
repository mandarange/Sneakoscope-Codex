import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllFeaturesSelftest, buildFeatureRegistry } from '../../src/core/feature-registry.mjs';

test('all-features mock selftest includes fixture summary', async () => {
  const registry = await buildFeatureRegistry({ root: process.cwd() });
  const result = buildAllFeaturesSelftest(registry);
  assert.equal(result.fixtures.ok, true);
  assert.ok(result.checks.some((check) => check.id === 'fixture_contracts_present'));
});

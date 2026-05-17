import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllFeaturesSelftest, buildFeatureRegistry } from '../../src/core/feature-registry.mjs';

test('all-features execute-fixtures mode reaches release fixture threshold', async () => {
  const registry = await buildFeatureRegistry({ root: process.cwd() });
  const result = buildAllFeaturesSelftest(registry, { executeFixtures: true });
  assert.equal(result.ok, true);
  assert.ok((result.fixtures.counts.pass || 0) >= 45);
  assert.equal(result.fixtures.counts.blocked || 0, 0);
  assert.equal(result.executable_fixtures.ok, true);
  assert.ok(result.executable_fixtures.executed > 0);
  assert.equal(result.executable_fixtures.command_execution, 'safe-allowlist');
});

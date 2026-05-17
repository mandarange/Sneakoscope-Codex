import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllFeaturesSelftest, buildFeatureRegistry } from '../../src/core/feature-registry.mjs';

test('feature registry carries fixture contracts', async () => {
  const registry = await buildFeatureRegistry({ root: process.cwd() });
  const proof = registry.features.find((feature) => feature.id === 'cli-proof');
  assert.equal(proof.fixture.status, 'pass');
  assert.ok(registry.source_inventory.dollar_commands.includes('$Commit'));
  assert.ok(registry.source_inventory.dollar_commands.includes('$Commit-And-Push'));
  assert.ok(registry.source_inventory.cli_command_names.includes('commit'));
  assert.ok(registry.source_inventory.cli_command_names.includes('commit-and-push'));
  const selftest = buildAllFeaturesSelftest(registry);
  assert.equal(selftest.fixtures.ok, true);
});

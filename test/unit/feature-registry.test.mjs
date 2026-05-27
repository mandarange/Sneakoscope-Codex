import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllFeaturesSelftest, buildFeatureRegistry, validateFeatureRegistry } from '../../dist/core/feature-registry.js';

test('feature registry carries fixture contracts', async () => {
  const registry = await buildFeatureRegistry({ root: process.cwd() });
  const proof = registry.features.find((feature) => feature.id === 'cli-proof');
  assert.equal(proof.fixture.status, 'pass');
  assert.ok(registry.source_inventory.dollar_commands.includes('$Commit'));
  assert.ok(registry.source_inventory.dollar_commands.includes('$Commit-And-Push'));
  assert.ok(registry.source_inventory.cli_command_names.includes('commit'));
  assert.ok(registry.source_inventory.cli_command_names.includes('commit-and-push'));
  assert.ok(registry.source_inventory.cli_command_names.includes('hermes'));
  assert.ok(registry.source_inventory.doc_route_mentions.includes('$CODEX_HOME'));
  const hermes = registry.features.find((feature) => feature.id === 'cli-hermes');
  assert.equal(hermes.fixture.status, 'pass');
  const selftest = buildAllFeaturesSelftest(registry);
  assert.equal(registry.coverage.ok, true);
  assert.equal(selftest.ok, true);
  assert.equal(selftest.fixtures.ok, true);
  assert.equal(selftest.coverage.doc_route_mentions_without_route.includes('$CODEX_HOME'), false);
});

test('feature registry does not silently allow unknown uppercase dollar mentions', () => {
  const coverage = validateFeatureRegistry({
    features: [
      {
        id: 'route-team',
        source_refs: {
          cli_command_names: [],
          handler_keys: [],
          dollar_commands: ['$Team'],
          app_skill_aliases: [],
          skills: []
        }
      }
    ],
    source_inventory: {
      cli_command_names: [],
      handler_keys: [],
      dollar_commands: ['$Team'],
      app_skill_aliases: [],
      skills: [],
      doc_route_mentions: ['$FOO_BAR', '$CODEX_HOME']
    }
  });
  assert.ok(coverage.blockers.includes('doc_route_mention_without_route:$FOO_BAR'));
  assert.equal(coverage.doc_route_mentions_without_route.includes('$CODEX_HOME'), false);
});

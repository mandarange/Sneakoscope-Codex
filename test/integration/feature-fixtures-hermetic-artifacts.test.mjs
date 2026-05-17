import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureRegistry, executeFeatureFixtures } from '../../src/core/feature-registry.mjs';

test('strict executable feature fixtures validate generated artifacts', async () => {
  const registry = await buildFeatureRegistry({ root: process.cwd() });
  const report = executeFeatureFixtures(registry.features.filter((feature) => ['cli-scouts', 'route-team'].includes(feature.id)), {
    root: process.cwd(),
    strictArtifacts: true
  });
  assert.equal(report.ok, true, report.failures.join(', '));
  assert.ok(report.artifact_schema_validated > 0);
});

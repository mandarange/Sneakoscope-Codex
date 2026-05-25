import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { FEATURE_QUALITY_LEVELS, fixtureForFeature, fixtureSummary } from '../../dist/core/feature-fixtures.js';
import { buildAllFeaturesSelftest, buildFeatureRegistry, runtimeRoutesNotStaticContract } from '../../dist/core/feature-registry.js';

test('feature fixtures expose the 0.9.20 quality taxonomy', () => {
  assert.deepEqual(FEATURE_QUALITY_LEVELS, [
    'runtime_verified',
    'runtime_mock_verified',
    'integration_optional',
    'static_contract',
    'missing'
  ]);
  assert.equal(fixtureForFeature('cli-proof').quality, 'runtime_verified');
  assert.equal(fixtureForFeature('route-team').quality, 'runtime_verified');
  assert.equal(fixtureForFeature('route-answer').quality, 'runtime_mock_verified');
  assert.equal(fixtureForFeature('cli-doctor').quality, 'integration_optional');
  assert.equal(fixtureForFeature('cli-help').quality, 'runtime_verified');
  assert.equal(fixtureForFeature('unknown-runtime-feature').quality, 'missing');
});

test('runtime route features are not static_contract', async () => {
  const registry = await buildFeatureRegistry({ root: process.cwd() });
  const routeQuality = runtimeRoutesNotStaticContract(registry.features);
  assert.equal(routeQuality.ok, true, routeQuality.blockers.join(', '));
  const summary = fixtureSummary(registry.features);
  for (const level of FEATURE_QUALITY_LEVELS) assert.ok(Object.hasOwn(summary.quality_counts, level));
  assert.deepEqual(registry.feature_quality_summary, summary.quality_counts);
  const selftest = buildAllFeaturesSelftest(registry);
  assert.ok(selftest.checks.some((check) => check.id === 'runtime_routes_not_static_contract' && check.ok));
  assert.ok(selftest.feature_quality_summary.runtime_verified > 0);
});

test('check-feature-quality script reports visible quality counts', () => {
  const result = spawnSync(process.execPath, ['scripts/check-feature-quality.mjs', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, 'sks.feature-quality-check.v1');
  assert.equal(parsed.ok, true);
  assert.ok(parsed.quality_counts.runtime_verified > 0);
  assert.ok(parsed.quality_counts.runtime_mock_verified > 0);
  assert.deepEqual(parsed.runtime_route_static_contract_blockers, []);
});

#!/usr/bin/env node
import { buildFeatureRegistry, runtimeRoutesNotStaticContract } from '../src/core/feature-registry.mjs';
import { FEATURE_QUALITY_LEVELS, validateFeatureFixtures } from '../src/core/feature-fixtures.mjs';
import { packageRoot } from '../src/core/fsx.mjs';

const json = process.argv.includes('--json');
const releaseGate = process.argv.includes('--release') || process.argv.includes('--stable') || process.argv.includes('--rc');
const root = packageRoot();
const registry = await buildFeatureRegistry({ root });
const fixtures = validateFeatureFixtures(registry.features);
const routeQuality = runtimeRoutesNotStaticContract(registry.features);
const qualityCounts = registry.feature_quality_summary || registry.fixture_summary?.quality_counts || {};
const missingLevels = FEATURE_QUALITY_LEVELS.filter((level) => !Object.hasOwn(qualityCounts, level));
const blockers = [
  ...fixtures.blockers,
  ...routeQuality.blockers,
  ...missingLevels.map((level) => `quality_level_missing:${level}`),
  ...(releaseGate ? releaseQualityBlockers(qualityCounts) : [])
];
const result = {
  schema: 'sks.feature-quality-check.v1',
  ok: blockers.length === 0,
  quality_levels: FEATURE_QUALITY_LEVELS,
  quality_counts: qualityCounts,
  fixture_status_counts: registry.fixture_summary?.counts || {},
  runtime_route_static_contract_blockers: routeQuality.blockers,
  blockers
};

if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Feature quality: ${result.ok ? 'ok' : 'blocked'}`);
  console.log(Object.entries(qualityCounts).map(([level, count]) => `${level}=${count}`).join(', '));
  for (const blocker of blockers) console.log(`- ${blocker}`);
}

if (!result.ok) process.exitCode = 1;

function releaseQualityBlockers(counts = {}) {
  const blockers = [];
  if (Number(counts.runtime_verified || 0) < 22) blockers.push(`runtime_verified_below_release_target:${counts.runtime_verified || 0}<22`);
  if (Number(counts.runtime_mock_verified || 0) < 45) blockers.push(`runtime_mock_verified_below_release_target:${counts.runtime_mock_verified || 0}<45`);
  if (Number(counts.integration_optional || 0) > 6) blockers.push(`integration_optional_above_release_target:${counts.integration_optional || 0}>6`);
  if (Number(counts.static_contract || 0) > 45) blockers.push(`static_contract_above_release_target:${counts.static_contract || 0}>45`);
  if (Number(counts.missing || 0) !== 0) blockers.push(`missing_above_release_target:${counts.missing || 0}`);
  return blockers;
}

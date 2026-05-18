#!/usr/bin/env node
import { buildFeatureRegistry, runtimeRoutesNotStaticContract } from '../src/core/feature-registry.mjs';
import { FEATURE_QUALITY_LEVELS, validateFeatureFixtures } from '../src/core/feature-fixtures.mjs';
import { packageRoot } from '../src/core/fsx.mjs';

const json = process.argv.includes('--json');
const root = packageRoot();
const registry = await buildFeatureRegistry({ root });
const fixtures = validateFeatureFixtures(registry.features);
const routeQuality = runtimeRoutesNotStaticContract(registry.features);
const qualityCounts = registry.feature_quality_summary || registry.fixture_summary?.quality_counts || {};
const missingLevels = FEATURE_QUALITY_LEVELS.filter((level) => !Object.hasOwn(qualityCounts, level));
const blockers = [
  ...fixtures.blockers,
  ...routeQuality.blockers,
  ...missingLevels.map((level) => `quality_level_missing:${level}`)
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

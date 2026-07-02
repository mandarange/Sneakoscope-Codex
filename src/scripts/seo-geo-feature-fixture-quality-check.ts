#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const registryMod = await importDist('core/feature-registry.js');
const registry = await registryMod.buildFeatureRegistry({ root });
const byId = new Map(registry.features.map((feature) => [feature.id, feature]));

for (const id of ['cli-seo-geo-optimizer', 'route-seo-geo-optimizer']) {
  const feature = byId.get(id);
  assertGate(feature, `feature missing: ${id}`);
  assertGate(feature.fixture?.status === 'pass', `feature fixture must pass: ${id}`, feature);
  assertGate(feature.fixture?.quality !== 'static_contract', `SEO/GEO feature must not rely on static contract: ${id}`, feature.fixture);
  assertGate(feature.fixture?.quality === 'runtime_verified', `SEO/GEO fixture quality must be runtime-backed by execution: ${id}`, feature.fixture);
}

const selftest = registryMod.buildAllFeaturesSelftest(registry, {});
const runtimeCheck = selftest.checks.find((check) => check.id === 'runtime_routes_not_static_contract');
assertGate(runtimeCheck?.ok === true, 'runtime route static-contract guard must pass', runtimeCheck);

emitGate('seo-geo:feature-fixture-quality', { features: 2 });

#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, assertMissionArtifact, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('unsupported-claims', {
  description: 'Guarantees top rank and AI citation for every site.',
});
fs.appendFileSync(path.join(fixture, 'README.md'), '\nWe guarantee rank #1, traffic lift, and AI answer citation.\n');

const seo = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'seo', '--root', fixture, '--target', 'package', '--offline', '--json'], { allowFailure: true }).json;
const geo = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'geo', '--root', fixture, '--target', 'package', '--offline', '--json'], { allowFailure: true }).json;
const seoGate = assertMissionArtifact(seo.mission_id, 'seo-gate.json', fixture);
const geoGate = assertMissionArtifact(geo.mission_id, 'geo-gate.json', fixture);
const claims = assertMissionArtifact(geo.mission_id, 'claim-evidence-ledger.json', fixture);

assertGate(seoGate.ok === false && seoGate.unsupported_claims.length > 0, 'SEO gate must reject unsupported ranking/traffic/citation guarantees', seoGate);
assertGate(geoGate.ok === false && claims.claims.some((claim) => claim.safe_to_publish === false), 'GEO gate must reject unsupported AI citation claims', { geoGate, claims });

emitGate('seo-geo:no-unsupported-ranking-claims', { seo_mission: seo.mission_id, geo_mission: geo.mission_id });

#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('seo-geo-route-identity');
fs.mkdirSync(path.join(fixture, '.sneakoscope'), { recursive: true });
let seo;
let geo;
let seoMissionIsolated = false;
let geoMissionIsolated = false;
const cleanupFixture = () => fs.rmSync(fixture, { recursive: true, force: true });
process.once('exit', cleanupFixture);
try {
  seo = runSksJson(['run', '$SEO-GEO-OPTIMIZER SEO audit this fixture', '--execute', '--json'], { cwd: fixture }).json;
  seoMissionIsolated = fs.existsSync(path.join(fixture, '.sneakoscope', 'missions', seo.mission_id));
  geo = runSksJson(['run', '$SEO-GEO-OPTIMIZER Generative Engine Optimization audit AI search visibility', '--execute', '--json'], { cwd: fixture }).json;
  geoMissionIsolated = fs.existsSync(path.join(fixture, '.sneakoscope', 'missions', geo.mission_id));
} finally {
  cleanupFixture();
  process.removeListener('exit', cleanupFixture);
}

const seoText = JSON.stringify(seo);
const geoText = JSON.stringify(geo);
assertGate(seoMissionIsolated && geoMissionIsolated, 'SEO/GEO route identity missions must stay inside the hermetic fixture', {
  fixture,
  seo_mission_id: seo.mission_id,
  geo_mission_id: geo.mission_id,
  seo_mission_isolated: seoMissionIsolated,
  geo_mission_isolated: geoMissionIsolated
});
assertGate(/\$SEO-GEO-OPTIMIZER/.test(seoText) && /sks seo-geo-optimizer/.test(seoText) && /--mode seo/.test(seoText), 'sks run --execute must preserve unified optimizer route and execute seo mode path', seo);
assertGate(/\$SEO-GEO-OPTIMIZER/.test(geoText) && /sks seo-geo-optimizer/.test(geoText) && /--mode geo/.test(geoText), 'sks run --execute must preserve unified optimizer route and execute geo mode path', geo);
assertGate(!/\$AutoResearch/.test(seoText) && !/\$AutoResearch/.test(geoText), 'SEO/GEO route identity must not collapse into AutoResearch', { seo, geo });

assertGate(!fs.existsSync(fixture), 'SEO/GEO route identity fixture must be removed after the check', { fixture });
emitGate('seo-geo:route-identity', { seo_status: seo.status, geo_status: geo.status, hermetic_fixture_removed: true });

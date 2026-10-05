#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { importDist } from './gate-lib.js';
import { assertGate, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const SEO_PROMPT = '$SEO-GEO-OPTIMIZER SEO audit this fixture';
const GEO_PROMPT = '$SEO-GEO-OPTIMIZER Generative Engine Optimization audit AI search visibility';

const { routePrompt } = await importDist('core/routes.js');
const seoRoute = routePrompt(SEO_PROMPT);
const geoRoute = routePrompt(GEO_PROMPT);
assertGate(
  seoRoute.command === '$SEO-GEO-OPTIMIZER' && geoRoute.command === '$SEO-GEO-OPTIMIZER',
  'both SEO and GEO prompts must resolve to the unified optimizer route, not AutoResearch',
  { seo_route: seoRoute.command, geo_route: geoRoute.command }
);

const fixture = makeSearchVisibilityFixture('seo-geo-route-identity');
fs.mkdirSync(path.join(fixture, '.sneakoscope'), { recursive: true });
let seo;
let geo;
let seoMissionIsolated = false;
let geoMissionIsolated = false;
const cleanupFixture = () => fs.rmSync(fixture, { recursive: true, force: true });
process.once('exit', cleanupFixture);
try {
  seo = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'seo', '--target', 'auto', '--offline', '--json'], { cwd: fixture }).json;
  seoMissionIsolated = fs.existsSync(path.join(fixture, '.sneakoscope', 'missions', seo.mission_id, 'seo-gate.json'));
  geo = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'geo', '--target', 'auto', '--offline', '--json'], { cwd: fixture }).json;
  geoMissionIsolated = fs.existsSync(path.join(fixture, '.sneakoscope', 'missions', geo.mission_id, 'geo-gate.json'));
} finally {
  cleanupFixture();
  process.removeListener('exit', cleanupFixture);
}

const seoText = JSON.stringify(seo);
const geoText = JSON.stringify(geo);
assertGate(seoMissionIsolated && geoMissionIsolated, 'SEO/GEO route identity missions must stay inside the hermetic fixture and write their own mode gate', {
  fixture,
  seo_mission_id: seo.mission_id,
  geo_mission_id: geo.mission_id,
  seo_mission_isolated: seoMissionIsolated,
  geo_mission_isolated: geoMissionIsolated
});
assertGate(seo.route === '$SEO-GEO-OPTIMIZER' && /seo-findings\.json/.test(seoText), 'sks seo-geo-optimizer --mode seo must keep the unified optimizer route and run the seo path', seo);
assertGate(geo.route === '$SEO-GEO-OPTIMIZER' && /geo-findings\.json/.test(geoText), 'sks seo-geo-optimizer --mode geo must keep the unified optimizer route and run the geo path', geo);
assertGate(!/\$AutoResearch/.test(seoText) && !/\$AutoResearch/.test(geoText), 'SEO/GEO route identity must not collapse into AutoResearch', { seo, geo });

assertGate(!fs.existsSync(fixture), 'SEO/GEO route identity fixture must be removed after the check', { fixture });
emitGate('seo-geo:route-identity', { seo_status: seo.status, geo_status: geo.status, hermetic_fixture_removed: true });

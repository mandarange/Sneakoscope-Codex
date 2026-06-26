#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, runSksJson } from './search-visibility-gate-lib.js';

const seo = runSksJson(['run', '$SEO-GEO-OPTIMIZER SEO audit this fixture', '--execute', '--json']).json;
const geo = runSksJson(['run', '$SEO-GEO-OPTIMIZER Generative Engine Optimization audit AI search visibility', '--execute', '--json']).json;

const seoText = JSON.stringify(seo);
const geoText = JSON.stringify(geo);
assertGate(/\$SEO-GEO-OPTIMIZER/.test(seoText) && /sks seo-geo-optimizer/.test(seoText) && /--mode seo/.test(seoText), 'sks run --execute must preserve unified optimizer route and execute seo mode path', seo);
assertGate(/\$SEO-GEO-OPTIMIZER/.test(geoText) && /sks seo-geo-optimizer/.test(geoText) && /--mode geo/.test(geoText), 'sks run --execute must preserve unified optimizer route and execute geo mode path', geo);
assertGate(!/\$AutoResearch/.test(seoText) && !/\$AutoResearch/.test(geoText), 'SEO/GEO route identity must not collapse into AutoResearch', { seo, geo });

emitGate('seo-geo:route-identity', { seo_status: seo.status, geo_status: geo.status });

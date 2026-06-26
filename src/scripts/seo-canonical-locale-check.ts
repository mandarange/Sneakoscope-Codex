#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, assertMissionArtifact, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('seo-locale');
fs.mkdirSync(path.join(fixture, 'public', 'fr'), { recursive: true });
fs.writeFileSync(path.join(fixture, 'public', 'fr', 'index.html'), '<!doctype html><html lang="fr"><head><title>FR</title><link rel="canonical" href="/fr"></head><body><h1>FR</h1></body></html>\n');

const audit = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'seo', '--root', fixture, '--target', 'website', '--framework', 'static', '--url', 'https://example.test', '--offline', '--json']).json;
const canonical = assertMissionArtifact(audit.mission_id, 'canonical-map.json', fixture);
const locale = assertMissionArtifact(audit.mission_id, 'locale-graph.json', fixture);
const sitemap = assertMissionArtifact(audit.mission_id, 'sitemap-audit.json', fixture);
const findings = assertMissionArtifact(audit.mission_id, 'seo-findings.json', fixture);

assertGate(/not guaranteed/i.test(canonical.warning), 'canonical report must avoid search-engine selection guarantees', canonical);
assertGate(locale.checks.self_hreflang_verified === false && Array.isArray(locale.unverified), 'locale report must separate unverified hreflang checks', locale);
assertGate(sitemap.indexing_guarantee === false, 'sitemap report must not claim indexing guarantee', sitemap);
assertGate(findings.findings.some((finding) => finding.ruleId.includes('canonical') || finding.category === 'locale'), 'fixture should produce canonical or locale findings', findings);

emitGate('seo:canonical-sitemap-locale', { mission_id: audit.mission_id });

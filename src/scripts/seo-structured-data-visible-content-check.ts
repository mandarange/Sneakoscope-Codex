#!/usr/bin/env node
// @ts-nocheck
import { assertGate, assertMissionArtifact, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const html = [
  '<!doctype html>',
  '<html lang="en"><head><title>Structured Data Fixture</title>',
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","aggregateRating":{"ratingValue":5,}}</script>',
  '</head><body><h1>Structured Data Fixture</h1><p>Visible source content only.</p></body></html>',
  '',
].join('\n');
const fixture = makeSearchVisibilityFixture('seo-structured', { html });
const audit = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'seo', '--root', fixture, '--target', 'website', '--framework', 'static', '--url', 'https://example.test', '--offline', '--json']).json;
const ledger = assertMissionArtifact(audit.mission_id, 'structured-data-ledger.json', fixture);
const findings = assertMissionArtifact(audit.mission_id, 'seo-findings.json', fixture);

assertGate(ledger.policies.some((url) => /structured-data/.test(url)), 'structured data ledger must cite structured-data policy sources', ledger);
assertGate(ledger.pages.some((page) => page.parse_errors.length > 0), 'invalid JSON-LD must be recorded as parse error', ledger);
assertGate(findings.findings.some((finding) => finding.ruleId.includes('jsonld-parse') && finding.evidence.length > 0), 'invalid JSON-LD finding must carry evidence', findings);

emitGate('seo:structured-data-visible-content', { mission_id: audit.mission_id });

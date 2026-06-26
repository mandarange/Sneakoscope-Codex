#!/usr/bin/env node
// @ts-nocheck
import { assertGate, assertMissionArtifact, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('seo-audit');
const { json } = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'seo', '--root', fixture, '--target', 'website', '--framework', 'static', '--url', 'https://example.test', '--offline', '--json']);

assertGate(json.route === '$SEO-GEO-OPTIMIZER' && json.mission_id, 'seo audit must create a unified optimizer mission', json);
const inventory = assertMissionArtifact(json.mission_id, 'site-inventory.json', fixture);
const findings = assertMissionArtifact(json.mission_id, 'seo-findings.json', fixture);
const gate = assertMissionArtifact(json.mission_id, 'seo-gate.json', fixture);
const proof = assertMissionArtifact(json.mission_id, 'completion-proof.json', fixture);

assertGate(inventory.detected_adapter.adapterId === 'static-site', 'fixture should detect static-site adapter', inventory.detected_adapter);
assertGate(Array.isArray(findings.findings) && findings.findings.every((finding) => finding.evidence?.length > 0), 'SEO findings must be atomic and evidence-backed', findings);
assertGate(gate.route === '$SEO-GEO-OPTIMIZER' && gate.completion_proof.endsWith('/completion-proof.json'), 'seo gate must link completion proof', gate);
assertGate(proof.schema === 'sks.completion-proof.v1' && proof.route === '$SEO-GEO-OPTIMIZER', 'completion proof must retain unified route identity', proof);

emitGate('seo:audit-fixture', { mission_id: json.mission_id, findings: findings.findings.length });

#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, assertMissionArtifact, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('geo-claims', {
  title: 'Fixture That Guarantees AI Citation',
  description: 'Fixture that guarantees AI citation and traffic lift.',
});
fs.appendFileSync(path.join(fixture, 'README.md'), '\nThis fixture guarantees AI citation and traffic lift.\n');
const audit = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'geo', '--root', fixture, '--target', 'package', '--offline', '--json'], { allowFailure: true }).json;
const claims = assertMissionArtifact(audit.mission_id, 'claim-evidence-ledger.json', fixture);
const findings = assertMissionArtifact(audit.mission_id, 'geo-findings.json', fixture);

assertGate(claims.claims.some((claim) => claim.safe_to_publish === false && /citation|traffic/i.test(claim.claim)), 'unsupported GEO claim must be unsafe to publish', claims);
assertGate(findings.findings.some((finding) => finding.category === 'claim-evidence' && finding.severity === 'critical'), 'unsafe claim must become critical claim-evidence finding', findings);
assertGate(audit.ok === false || findings.findings.some((finding) => finding.blocking), 'critical unsafe claims must block the gate', { audit, findings });

emitGate('geo:claim-evidence', { mission_id: audit.mission_id, claims: claims.claims.length });

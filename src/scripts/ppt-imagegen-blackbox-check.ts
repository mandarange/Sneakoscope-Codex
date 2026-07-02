#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { osTempPngFixtureArg } from './lib/valid-png-fixture.js';

const repoRoot = process.cwd();
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-ppt-imagegen-blackbox-'));
const sksBin = path.join(repoRoot, 'dist', 'bin', 'sks.js');
const sourceImage = osTempPngFixtureArg('ppt-imagegen-blackbox-source.png');
const run = spawnSync(process.execPath, [sksBin, 'ppt', 'review', '--manual-slide-images', sourceImage, '--mock', '--json'], {
  cwd: runRoot,
  env: { ...process.env, SKS_TEST_FAKE_IMAGEGEN: '1', SKS_TEST_FAKE_EXTRACTOR: '1', SKS_MOCK: '1', NODE_ENV: 'test', SKS_UPDATE_MIGRATION_GATE_DISABLED: '1', SKS_SKIP_NPM_FRESHNESS_CHECK: '1' },
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024
});
const parsed = parseJson(run.stdout);
const missionDir = parsed?.mission_id ? path.join(runRoot, '.sneakoscope', 'missions', parsed.mission_id) : null;
const callouts = missionDir ? readJson(path.join(missionDir, 'ppt-slide-callout-ledger.json')) : null;
const slideIssues = missionDir ? readJson(path.join(missionDir, 'ppt-slide-issue-ledger.json')) : null;
const deckIssues = missionDir ? readJson(path.join(missionDir, 'ppt-deck-issue-ledger.json')) : null;
const proofEvidence = parsed?.proof_evidence || null;
const ok = Boolean(parsed?.mission_id)
  && callouts?.generated_slide_callout_images_count === 1
  && callouts?.generated_review_images?.[0]?.mock === true
  && callouts?.generated_review_images?.[0]?.evidence_class === 'mock_fixture'
  && Array.isArray(slideIssues?.issues)
  && slideIssues.issues.length > 0
  && deckIssues?.schema === 'sks.ppt-deck-issue-ledger.v1'
  && proofEvidence?.schema === 'sks.ppt-review-proof-evidence.v1';
console.log(JSON.stringify({ schema: 'sks.ppt-imagegen-blackbox-check.v1', ok, process_status: run.status, mission_id: parsed?.mission_id || null, gate_status: parsed?.status || null, run_root: runRoot, source_image: sourceImage, generated_count: callouts?.generated_slide_callout_images_count || 0, issue_count: slideIssues?.issues?.length || 0, proof_status: proofEvidence?.status || null }, null, 2));
if (!ok) process.exitCode = 1;

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

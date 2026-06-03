#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { osTempPngFixtureArg } from './lib/valid-png-fixture.js';

const sourceImage = osTempPngFixtureArg('ppt-imagegen-blackbox-source.png');
const run = spawnSync(process.execPath, ['./dist/bin/sks.js', 'ppt', 'review', '--manual-slide-images', sourceImage, '--json'], {
  cwd: process.cwd(),
  env: { ...process.env, SKS_TEST_FAKE_IMAGEGEN: '1', SKS_TEST_FAKE_EXTRACTOR: '1' },
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024
});
const parsed = parseJson(run.stdout);
const missionDir = parsed?.mission_id ? path.join(process.cwd(), '.sneakoscope', 'missions', parsed.mission_id) : null;
const callouts = missionDir ? readJson(path.join(missionDir, 'ppt-slide-callout-ledger.json')) : null;
const slideIssues = missionDir ? readJson(path.join(missionDir, 'ppt-slide-issue-ledger.json')) : null;
const deckIssues = missionDir ? readJson(path.join(missionDir, 'ppt-deck-issue-ledger.json')) : null;
const proofEvidence = parsed?.proof_evidence || null;
const ok = Boolean(parsed?.mission_id)
  && callouts?.generated_slide_callout_images_count === 1
  && callouts?.generated_review_images?.[0]?.mock === true
  && Array.isArray(slideIssues?.issues)
  && slideIssues.issues.length > 0
  && deckIssues?.schema === 'sks.ppt-deck-issue-ledger.v1'
  && proofEvidence?.schema === 'sks.ppt-review-proof-evidence.v1';
console.log(JSON.stringify({ schema: 'sks.ppt-imagegen-blackbox-check.v1', ok, process_status: run.status, mission_id: parsed?.mission_id || null, gate_status: parsed?.status || null, source_image: sourceImage, generated_count: callouts?.generated_slide_callout_images_count || 0, issue_count: slideIssues?.issues?.length || 0, proof_status: proofEvidence?.status || null }, null, 2));
if (!ok) process.exitCode = 1;

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { osTempPngFixtureArg } from './lib/valid-png-fixture.mjs';

const sourceImage = osTempPngFixtureArg('ux-review-imagegen-blackbox-source.png');
const run = spawnSync(process.execPath, ['./dist/bin/sks.js', 'ux-review', 'run', '--image', sourceImage, '--generate-callouts', '--json'], {
  cwd: process.cwd(),
  env: { ...process.env, SKS_TEST_FAKE_IMAGEGEN: '1', SKS_TEST_FAKE_EXTRACTOR: '1' },
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024
});
const parsed = parseJson(run.stdout);
const missionDir = parsed?.mission_id ? path.join(process.cwd(), '.sneakoscope', 'missions', parsed.mission_id) : null;
const request = missionDir ? readJson(path.join(missionDir, 'image-ux-gpt-image-2-request.json')) : null;
const response = missionDir ? readJson(path.join(missionDir, 'image-ux-gpt-image-2-response.json')) : null;
const issues = missionDir ? readJson(path.join(missionDir, 'image-ux-issue-ledger.json')) : null;
const generated = missionDir ? readJson(path.join(missionDir, 'image-ux-generated-review-ledger.json')) : null;
const proof = missionDir ? readJson(path.join(missionDir, 'completion-proof.json')) : null;
const ok = Boolean(parsed?.mission_id)
  && run.status === 0
  && parsed?.status === 'verified_partial_reference'
  && request?.validation?.ok === true
  && response?.fake_adapter === true
  && generated?.generated_count === 1
  && generated?.real_generated_count === 0
  && generated?.non_real_generated_count === 1
  && generated?.generated_review_images?.[0]?.mock === true
  && Array.isArray(issues?.issues)
  && issues.issues.length > 0
  && issues.issues.every((issue) => issue.source === 'mock_fixture')
  && proof?.status === 'verified_partial'
  && proof?.evidence?.image_ux_review?.reference_only === true
  && proof?.evidence?.image_ux_review?.generated_gpt_image_2_callout_images_count === 0;
console.log(JSON.stringify({
  schema: 'sks.ux-review-imagegen-blackbox-check.v1',
  ok,
  process_status: run.status,
  mission_id: parsed?.mission_id || null,
  gate_status: parsed?.status || null,
  proof_status: proof?.status || null,
  reference_only: proof?.evidence?.image_ux_review?.reference_only === true,
  source_image: sourceImage,
  request,
  response,
  issue_count: issues?.issues?.length || 0
}, null, 2));
if (!ok) process.exitCode = 1;

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const run = spawnSync(process.execPath, ['./dist/bin/sks.js', 'ux-review', 'run', '--image', 'test/fixtures/images/one-by-one.png', '--generate-callouts', '--json'], {
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
const ok = Boolean(parsed?.mission_id)
  && request?.validation?.ok === true
  && response?.fake_adapter === true
  && generated?.generated_count === 1
  && generated?.generated_review_images?.[0]?.mock === true
  && Array.isArray(issues?.issues)
  && issues.issues.length > 0
  && issues.issues.every((issue) => issue.source === 'mock_fixture');
console.log(JSON.stringify({ schema: 'sks.ux-review-imagegen-blackbox-check.v1', ok, process_status: run.status, mission_id: parsed?.mission_id || null, gate_status: parsed?.status || null, request, response, issue_count: issues?.issues?.length || 0 }, null, 2));
if (!ok) process.exitCode = 1;

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

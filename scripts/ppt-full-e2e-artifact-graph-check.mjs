#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const reportPath = path.join(process.cwd(), '.sneakoscope', 'reports', 'ppt-full-e2e-blackbox.json');
if (!fs.existsSync(reportPath)) {
  const run = spawnSync(process.execPath, ['./scripts/ppt-full-e2e-blackbox-check.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (run.status !== 0) {
    console.log(JSON.stringify({ schema: 'sks.ppt-full-e2e-artifact-graph.v1', ok: false, blocker: 'blackbox_failed', stdout_tail: run.stdout.slice(-2000), stderr_tail: run.stderr.slice(-2000) }, null, 2));
    process.exit(1);
  }
}
const blackbox = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const required = ['inventory', 'exportLedger', 'callouts', 'slideIssues', 'deckIssues'];
const blockers = required.filter((key) => !blackbox.artifacts?.[key]).map((key) => `missing:${key}`);
if (!blackbox.artifacts?.proof_schema) blockers.push('missing:completion_proof');
if (!blackbox.artifacts?.trust_schema) blockers.push('missing:trust_report');
if (blackbox.generated_slide_review_count < blackbox.exported_slide_images_count) blockers.push('generated_review_count_lt_slide_count');
if (blackbox.issue_extraction_count <= 0) blockers.push('issue_extraction_empty');
if (!blackbox.mock_fake_not_verified_real) blockers.push('mock_promoted_to_real');
const result = {
  schema: 'sks.ppt-full-e2e-artifact-graph.v1',
  ok: blockers.length === 0,
  mission_id: blackbox.mission_id,
  local_only_policy: true,
  generated_slide_review_count: blackbox.generated_slide_review_count,
  slide_count: blackbox.exported_slide_images_count,
  issue_extraction_count: blackbox.issue_extraction_count,
  blockers
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

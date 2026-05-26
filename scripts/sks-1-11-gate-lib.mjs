#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function assertGate(condition, message, detail = {}) {
  if (condition) return;
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2));
  process.exit(1);
}

export function emitGate(name, detail = {}) {
  console.log(JSON.stringify({ schema: 'sks.release-gate.1-14.v1', ok: true, gate: name, ...detail }, null, 2));
}

export function runSksJson(args) {
  const entrypoint = path.join(root, 'dist', 'bin', 'sks.js');
  assertGate(fs.existsSync(entrypoint), 'dist entrypoint missing; run npm run build first', { entrypoint });
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: Number(process.env.SKS_GATE_TIMEOUT_MS || 120_000),
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' }
  });
  if (result.status !== 0) {
    assertGate(false, 'sks command failed', { args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    assertGate(false, 'sks command did not emit parseable JSON', { args, stdout: result.stdout, error: err.message });
  }
}

export function runPptReview(action = 'review') {
  const json = runSksJson(['ppt', 'fixture', '--mock', '--json']);
  const proof = readMissionJson(json.mission_id, 'completion-proof.json');
  const review = json.artifacts || json.imagegen_review || {};
  json.proof_evidence = proof.evidence?.ppt_review || json.artifacts?.proof_evidence || {};
  json.artifacts = {
    ...review,
    callouts: {
      ...(review.slide_callout_ledger || {}),
      no_text_fallback: review.slide_callout_ledger?.text_only_fallback_allowed === false || review.slide_callout_ledger?.generated_slide_callout_images_count > 0
    },
    slideIssues: review.slide_issue_ledger || {}
  };
  assertGate(json.ok === true, 'ppt imagegen review fixture blocked', json);
  assertGate(json.proof_evidence?.generated_slide_callout_images_count > 0, 'ppt callout image evidence missing', json.proof_evidence);
  assertGate(json.proof_evidence?.slide_issue_extraction_status === 'valid', 'ppt issue extraction missing', json.proof_evidence);
  return json;
}

export function runDfixFixture() {
  const json = runSksJson(['dfix', 'fixture', '--json']);
  json.gate = json.gate || json.artifacts?.gate;
  assertGate(json.ok === true, 'dfix fixture blocked', json);
  assertGate(json.gate?.passed === true, 'dfix gate did not pass', json.gate);
  return json;
}

export function runUxFixture() {
  const json = runSksJson(['image-ux-review', 'fixture', '--mock', '--json']);
  assertGate(json.ok === true, 'image UX review fixture blocked', json);
  return json;
}

export function missionFile(missionId, file) {
  return path.join(root, '.sneakoscope', 'missions', missionId, file);
}

export function readMissionJson(missionId, file) {
  const absolute = missionFile(missionId, file);
  assertGate(fs.existsSync(absolute), `mission artifact missing: ${file}`, { mission_id: missionId, absolute });
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

export function hasRelationType(missionId, type) {
  const ledger = readMissionJson(missionId, 'image-voxel-ledger.json');
  return (ledger.relations || []).some((relation) => relation.type === type);
}

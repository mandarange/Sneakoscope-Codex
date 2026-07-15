import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyCompletionProof } from '../../dist/core/proof/proof-schema.js';
import { validateCompletionProof } from '../../dist/core/proof/validation.js';
import { validateRouteCompletionProof } from '../../dist/core/proof/route-proof-gate.js';

test('completion proof validation blocks failed status', () => {
  const proof = emptyCompletionProof({ route: '$Naruto', status: 'failed' });
  const validation = validateCompletionProof(proof);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('proof_failed'));
});

test('route proof gate requires proof for serious routes', async () => {
  const gate = await validateRouteCompletionProof(process.cwd(), {
    missionId: 'missing',
    route: '$Naruto',
    state: { proof_required: true }
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('completion_proof_missing'));
});

test('route proof gate requires official subagent gate evidence for Release-Review routes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-missing-subagents-'));
  await writeRouteProof(root, 'M-release-review', { route: '$Release-Review', evidence: {} });
  const gate = await validateRouteCompletionProof(root, { missionId: 'M-release-review', route: '$Release-Review' });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('official_subagent_route_gate_missing'));
});

test('official Naruto proof uses correlated subagent evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-official-naruto-'));
  await writeRouteProof(root, 'M-naruto', {
    route: '$Naruto',
    status: 'verified_partial',
    summary: { files_changed: 0, commands_run: 0, tests_passed: 1, tests_failed: 0, manual_review_required: true },
    evidence: {
      route_gate: {
        workflow: 'official_codex_subagent',
        official_subagent_evidence: true,
        parent_summary_present: true
      }
    }
  });
  const gate = await validateRouteCompletionProof(root, {
    missionId: 'M-naruto',
    route: '$Naruto',
    state: { subagents_required: true, native_sessions_required: false }
  });
  assert.equal(gate.ok, true);
  assert.ok(!gate.issues.includes('official_subagent_evidence_missing'));
});

test('route proof gate accepts Release-Review official subagent evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-release-subagents-'));
  await writeRouteProof(root, 'M-release-review', {
    route: '$Release-Review',
    evidence: {
      route_gate: {
        workflow: 'official_codex_subagent',
        official_subagent_evidence: true,
        parent_summary_present: true
      }
    }
  });
  const gate = await validateRouteCompletionProof(root, { missionId: 'M-release-review', route: '$Release-Review' });
  assert.equal(gate.ok, true);
});

test('route proof gate requires a parent summary for Release-Review routes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-missing-parent-summary-'));
  await writeRouteProof(root, 'M-release-review', {
    route: '$Release-Review',
    evidence: {
      route_gate: {
        workflow: 'official_codex_subagent',
        official_subagent_evidence: true,
        parent_summary_present: false
      }
    }
  });
  const gate = await validateRouteCompletionProof(root, { missionId: 'M-release-review', route: '$Release-Review' });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('official_subagent_parent_summary_missing'));
});

test('route proof gate treats Release-Review as proof and official subagent required', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-release-review-'));
  const missing = await validateRouteCompletionProof(root, { missionId: 'missing', route: '$Release-Review' });
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.includes('completion_proof_missing'));
  await writeRouteProof(root, 'M-release-review', { route: '$Release-Review', evidence: {} });
  const gate = await validateRouteCompletionProof(root, { missionId: 'M-release-review', route: '$Release-Review' });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('official_subagent_route_gate_missing'));
});

async function writeRouteProof(root, missionId, patch = {}) {
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const proof = {
    schema: 'sks.completion-proof.v1',
    version: 'fixture',
    generated_at: '2026-05-25T00:00:00.000Z',
    mission_id: missionId,
    route: '$Naruto',
    execution_class: 'real',
    status: 'verified',
    summary: { files_changed: 0, commands_run: 0, tests_passed: 0, tests_failed: 0, manual_review_required: false },
    evidence: {},
    claims: [],
    unverified: [],
    blockers: [],
    next_human_actions: [],
    ...patch
  };
  await fs.writeFile(path.join(dir, 'completion-proof.json'), JSON.stringify(proof, null, 2));
}

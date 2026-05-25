import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyCompletionProof } from '../../dist/core/proof/proof-schema.js';
import { validateCompletionProof } from '../../dist/core/proof/validation.js';
import { validateRouteCompletionProof } from '../../dist/core/proof/route-proof-gate.js';

test('completion proof validation blocks failed status', () => {
  const proof = emptyCompletionProof({ route: '$Team', status: 'failed' });
  const validation = validateCompletionProof(proof);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('proof_failed'));
});

test('route proof gate requires proof for serious routes', async () => {
  const gate = await validateRouteCompletionProof(process.cwd(), {
    missionId: 'missing',
    route: '$Team',
    state: { proof_required: true }
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('completion_proof_missing'));
});

test('route proof gate requires agent evidence for Team routes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-missing-agents-'));
  await writeRouteProof(root, 'M-team', { route: '$Team', evidence: {} });
  const gate = await validateRouteCompletionProof(root, { missionId: 'M-team', route: '$Team' });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('agent_proof_evidence_missing'));
});

test('route proof gate accepts scaled Team agent counts within policy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-scaled-agents-'));
  await writeRouteProof(root, 'M-team', {
    route: '$Team',
    evidence: {
      agents: {
        schema: 'sks.agent-proof-evidence.v1',
        ok: true,
        status: 'passed',
        agent_count: 8,
        all_sessions_closed: true,
        no_overlap_ok: true,
        ledger_hash_chain_ok: true,
        consensus_ok: true,
        janitor_ok: true,
        blockers: []
      }
    }
  });
  const gate = await validateRouteCompletionProof(root, { missionId: 'M-team', route: '$Team' });
  assert.equal(gate.ok, true);
});

test('route proof gate requires janitor evidence for Team routes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-missing-janitor-'));
  await writeRouteProof(root, 'M-team', {
    route: '$Team',
    evidence: {
      agents: {
        schema: 'sks.agent-proof-evidence.v1',
        ok: true,
        status: 'passed',
        agent_count: 5,
        all_sessions_closed: true,
        no_overlap_ok: true,
        ledger_hash_chain_ok: true,
        consensus_ok: true,
        blockers: []
      }
    }
  });
  const gate = await validateRouteCompletionProof(root, { missionId: 'M-team', route: '$Team' });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('agent_janitor_missing_or_not_ok'));
});

test('route proof gate treats Release-Review as proof and agent required', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-release-review-'));
  const missing = await validateRouteCompletionProof(root, { missionId: 'missing', route: '$Release-Review' });
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.includes('completion_proof_missing'));
  await writeRouteProof(root, 'M-release-review', { route: '$Release-Review', evidence: {} });
  const gate = await validateRouteCompletionProof(root, { missionId: 'M-release-review', route: '$Release-Review' });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('agent_proof_evidence_missing'));
});

async function writeRouteProof(root, missionId, patch = {}) {
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const proof = {
    schema: 'sks.completion-proof.v1',
    version: 'fixture',
    generated_at: '2026-05-25T00:00:00.000Z',
    mission_id: missionId,
    route: '$Team',
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

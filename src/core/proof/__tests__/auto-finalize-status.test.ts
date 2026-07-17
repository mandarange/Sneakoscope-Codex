import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { maybeFinalizeRoute } from '../auto-finalize.js';

async function makeMission(missionId: string, gate: Record<string, unknown>) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-auto-finalize-'));
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'mission.json'), JSON.stringify({ id: missionId, prompt: 'fixture' }, null, 2));
  await fsp.writeFile(path.join(dir, 'route-gate.json'), JSON.stringify(gate, null, 2));
  return { root, dir };
}

async function readProof(dir: string) {
  return JSON.parse(await fsp.readFile(path.join(dir, 'completion-proof.json'), 'utf8'));
}

test('gate failure rejects upgraded statusHint verified', async () => {
  const missionId = 'M-auto-failed-gate';
  const { root, dir } = await makeMission(missionId, { passed: false, ok: true, blockers: [], execution_class: 'real' });
  const result = await maybeFinalizeRoute(root, {
    missionId,
    route: '$DFix',
    gateFile: 'route-gate.json',
    statusHint: 'verified',
    lightweightEvidence: true,
    agents: false
  });
  const proof = await readProof(dir);
  assert.equal(result.status_hint, 'blocked');
  assert.equal(proof.status, 'blocked');
  assert.equal(proof.status_hint_rejected.requested, 'verified');
  assert.equal(proof.status_hint_rejected.computed, 'blocked');
});

test('passed gate allows statusHint downgrade to verified_partial', async () => {
  const missionId = 'M-auto-downgrade';
  const { root, dir } = await makeMission(missionId, { passed: true, ok: true, blockers: [], execution_class: 'real' });
  await maybeFinalizeRoute(root, {
    missionId,
    route: '$DFix',
    gateFile: 'route-gate.json',
    statusHint: 'verified_partial',
    lightweightEvidence: true,
    agents: false
  });
  const proof = await readProof(dir);
  assert.equal(proof.status, 'verified_partial');
  assert.equal(proof.execution_class, 'real');
});

test('explicit blockers force blocked despite upgraded statusHint', async () => {
  const missionId = 'M-auto-blocker';
  const { root, dir } = await makeMission(missionId, { passed: true, ok: true, blockers: [], execution_class: 'real' });
  await maybeFinalizeRoute(root, {
    missionId,
    route: '$DFix',
    gateFile: 'route-gate.json',
    blockers: ['fixture_blocker'],
    statusHint: 'verified',
    lightweightEvidence: true,
    agents: false
  });
  const proof = await readProof(dir);
  assert.equal(proof.status, 'blocked');
  assert.ok(proof.blockers.includes('fixture_blocker'));
});

test('mock official-subagent blockers remain visible and mock proof is not passing', async () => {
  const missionId = 'M-auto-mock-subagents';
  const { root, dir } = await makeMission(missionId, {
    passed: true,
    ok: true,
    blockers: [],
    execution_class: 'mock_fixture',
    workflow: 'official_codex_subagent',
    official_subagent_evidence: false,
    parent_summary_present: false
  });
  await maybeFinalizeRoute(root, {
    missionId,
    route: '$Naruto',
    gateFile: 'route-gate.json',
    blockers: ['official_subagent_evidence_missing', 'official_subagent_parent_summary_missing'],
    mock: true,
    statusHint: 'verified',
    lightweightEvidence: true,
    agents: false
  });
  const proof = await readProof(dir);
  assert.equal(proof.status, 'mock_only');
  assert.equal(proof.execution_class, 'mock_fixture');
  assert.equal(proof.route, '$sks-naruto');
  assert.ok(proof.blockers.includes('official_subagent_evidence_missing'));
  assert.ok(proof.blockers.includes('official_subagent_parent_summary_missing'));
  assert.equal(proof.evidence.route_gate.workflow, 'official_codex_subagent');
  assert.equal(proof.evidence.route_gate.official_subagent_evidence, false);
  assert.equal(proof.evidence.route_gate.parent_summary_present, false);
});

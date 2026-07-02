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

test('mock agent blockers remain visible and mock proof is not passing', async () => {
  const missionId = 'M-auto-mock-agents';
  const { root, dir } = await makeMission(missionId, { passed: true, ok: true, blockers: [], execution_class: 'mock_fixture' });
  await maybeFinalizeRoute(root, {
    missionId,
    route: '$Team',
    gateFile: 'route-gate.json',
    mock: true,
    statusHint: 'verified',
    lightweightEvidence: true
  });
  const proof = await readProof(dir);
  const agentProof = JSON.parse(await fsp.readFile(path.join(dir, 'agents', 'agent-proof-evidence.json'), 'utf8'));
  assert.equal(proof.status, 'mock_only');
  assert.equal(proof.execution_class, 'mock_fixture');
  assert.ok(proof.blockers.includes('agent_gate_not_passed'));
  assert.equal(agentProof.execution_class, 'mock_fixture');
  assert.equal(agentProof.ok, false);
  assert.equal(agentProof.status, 'mock_fixture');
});

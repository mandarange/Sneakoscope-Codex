import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { evaluateGate } from '../gate-evaluator.js';

async function makeMission(gate: Record<string, unknown> | null = null) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-gate-eval-'));
  const missionId = 'M-gate-eval';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(dir, { recursive: true });
  if (gate) await fsp.writeFile(path.join(dir, 'route-gate.json'), JSON.stringify(gate, null, 2));
  return { root, missionId };
}

test('evaluateGate passes only a real passed gate with no blockers', async () => {
  const { root, missionId } = await makeMission({ passed: true, ok: true, blockers: [], execution_class: 'real' });
  const verdict = await evaluateGate(root, missionId, 'route-gate.json');
  assert.equal(verdict.pass, true);
  assert.equal(verdict.verdict, 'pass');
  assert.deepEqual(verdict.reasons, []);
});

test('evaluateGate fails when passed is false', async () => {
  const { root, missionId } = await makeMission({ passed: false, ok: true, blockers: [], execution_class: 'real' });
  const verdict = await evaluateGate(root, missionId, 'route-gate.json');
  assert.equal(verdict.pass, false);
  assert.equal(verdict.verdict, 'fail');
  assert.ok(verdict.reasons.includes('gate_not_passed'));
});

test('evaluateGate reports mock_only for mock fixture gates', async () => {
  const { root, missionId } = await makeMission({ passed: true, ok: true, blockers: [], execution_class: 'mock_fixture' });
  const verdict = await evaluateGate(root, missionId, 'route-gate.json');
  assert.equal(verdict.pass, false);
  assert.equal(verdict.verdict, 'mock_only');
  assert.ok(verdict.reasons.includes('gate_execution_class_mock_fixture'));
});

test('evaluateGate reports missing when the gate file is absent', async () => {
  const { root, missionId } = await makeMission();
  const verdict = await evaluateGate(root, missionId, 'route-gate.json');
  assert.equal(verdict.pass, false);
  assert.equal(verdict.verdict, 'missing');
  assert.ok(verdict.reasons.includes('gate_file_missing'));
});

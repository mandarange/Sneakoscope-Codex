import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { evaluateLocalGate } from '../route-success-helpers.js';

async function makeMission(gate: Record<string, unknown> | null = null) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-local-gate-'));
  const missionId = 'M-local-gate-eval';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(dir, { recursive: true });
  if (gate) await fsp.writeFile(path.join(dir, 'route-gate.json'), JSON.stringify(gate, null, 2));
  return { root, missionId, dir };
}

test('evaluateLocalGate passes a real passed gate with no blockers', async () => {
  const { root, missionId } = await makeMission({ passed: true, ok: true, blockers: [], execution_class: 'real' });
  const result = await evaluateLocalGate({ root, missionId, gateFile: 'route-gate.json' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, []);
});

test('evaluateLocalGate fails closed when passed is false', async () => {
  const { root, missionId } = await makeMission({ passed: false, ok: false, blockers: [], execution_class: 'real' });
  const result = await evaluateLocalGate({ root, missionId, gateFile: 'route-gate.json' });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('gate_not_passed'));
  assert.ok(result.blockers.includes('gate_ok_false'));
});

test('evaluateLocalGate fails closed on execution_class mock_fixture even when passed:true', async () => {
  const { root, missionId } = await makeMission({ passed: true, ok: true, blockers: [], execution_class: 'mock_fixture' });
  const result = await evaluateLocalGate({ root, missionId, gateFile: 'route-gate.json' });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('gate_execution_class_mock_fixture'));
});

test('evaluateLocalGate reports a missing-gate blocker when the gate file is absent', async () => {
  const { root, missionId } = await makeMission();
  const result = await evaluateLocalGate({ root, missionId, gateFile: 'route-gate.json' });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('route-gate.json_missing'));
});

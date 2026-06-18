import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { checkStopGate } from '../stop-gate-check.js';
import { resolveStopGate } from '../stop-gate-resolver.js';
import { writeFinalStopGate } from '../stop-gate-writer.js';
import { evaluateStop } from '../../pipeline-internals/runtime-gates.js';

async function makeTempRoot(): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-sg-root-'));
  return root;
}

async function setupMission(root: string, missionId: string): Promise<string> {
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function writeCurrent(root: string, patch: Record<string, unknown>): Promise<void> {
  const stateDir = path.join(root, '.sneakoscope', 'state');
  await fsp.mkdir(stateDir, { recursive: true });
  const statePath = path.join(stateDir, 'current.json');
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(await fsp.readFile(statePath, 'utf8')); } catch { /* empty */ }
  await fsp.writeFile(statePath, JSON.stringify({ ...existing, ...patch, updated_at: new Date().toISOString() }, null, 2));
}

test('resolveStopGate finds naruto-gate.json in mission dir via current.json', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-test-001';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'naruto-gate.json'), JSON.stringify({ passed: true, schema: 'sks.naruto-gate.v1' }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto' });

  const res = await resolveStopGate({ root, route: 'Naruto' });
  assert.ok(res.gate_path, 'should resolve a gate path');
  assert.ok(res.gate_path!.includes(missionId), 'gate path should be in mission dir');
  assert.equal(res.reason, 'mission_dir');
});

test('checkStopGate returns allow_stop for passed naruto gate', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-test-002';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'naruto-gate.json'), JSON.stringify({ passed: true, schema: 'sks.naruto-gate.v1', terminal: true }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto' });

  const result = await checkStopGate({ root, route: 'Naruto' });
  assert.equal(result.action, 'allow_stop');
  assert.equal(result.ok, true);
  assert.ok(result.gate_path, 'should have gate_path');
});

test('checkStopGate returns continue for blocked gate', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-test-003';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'naruto-gate.json'), JSON.stringify({ passed: false, schema: 'sks.naruto-gate.v1' }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO' });

  const result = await checkStopGate({ root, route: 'Naruto' });
  assert.equal(result.action, 'continue');
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.checked_paths.length > 0, 'should have checked paths');
});

test('checkStopGate returns hard_blocked when hard-blocker.json exists with evidence', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-test-004';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'hard-blocker.json'), JSON.stringify({ passed: true, reason: 'native sessions unavailable', evidence: ['no codex native'] }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO' });

  const result = await checkStopGate({ root, route: 'Naruto' });
  assert.equal(result.action, 'hard_blocked');
  assert.equal(result.ok, true);
});

test('writeFinalStopGate writes canonical stop-gate.json and updates current state', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-test-005';
  const dir = await setupMission(root, missionId);

  const gate = await writeFinalStopGate({
    root,
    missionId,
    route: 'Naruto',
    routeCommand: '$Naruto',
    status: 'passed',
    terminal: true,
    terminalState: 'completed',
    evidence: { build_passed: true, tests_passed: true, route_evidence_passed: true },
    nativeGateFile: 'naruto-gate.json',
  });

  assert.equal(gate.passed, true);
  assert.equal(gate.schema, 'sks.stop-gate.v1');

  // Canonical files exist
  const stopGate = JSON.parse(await fsp.readFile(path.join(dir, 'stop-gate.json'), 'utf8'));
  assert.equal(stopGate.passed, true);
  assert.equal(stopGate.schema, 'sks.stop-gate.v1');

  const latest = JSON.parse(await fsp.readFile(path.join(dir, 'stop-gate.latest.json'), 'utf8'));
  assert.equal(latest.passed, true);

  const verify = JSON.parse(await fsp.readFile(path.join(dir, 'stop-gate-write-verify.json'), 'utf8'));
  assert.equal(verify.verified, true);

  // Current state has abs path
  const state = JSON.parse(await fsp.readFile(path.join(root, '.sneakoscope', 'state', 'current.json'), 'utf8'));
  assert.equal(state.stop_gate_status, 'passed');
  assert.ok(state.stop_gate_abs_path, 'should have stop_gate_abs_path');
  assert.equal(state.stop_gate_passed, true);

  // checkStopGate now returns allow_stop via abs path
  const result = await checkStopGate({ root, route: 'Naruto', explicitGatePath: state.stop_gate_abs_path });
  assert.equal(result.action, 'allow_stop');
});

test('regression: naruto-gate passed but hook blocked — resolver finds mission dir gate', async () => {
  // This reproduces the reported bug: naruto-gate.json is passed but hook looks in cwd
  const root = await makeTempRoot();
  const missionId = 'M-test-006';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'naruto-gate.json'), JSON.stringify({ passed: true, schema: 'sks.naruto-gate.v1', terminal: true }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto' });

  // A stray naruto-gate.json in root should NOT be picked up instead of mission dir
  await fsp.writeFile(path.join(root, 'naruto-gate.json'), JSON.stringify({ passed: false }));

  const result = await checkStopGate({ root, route: 'Naruto' });
  assert.equal(result.action, 'allow_stop', 'should allow stop because mission dir gate is passed');
  assert.ok(result.gate_path!.includes(missionId), 'should select mission dir gate, not root gate');
});

test('stop hook does not hidden-block after canonical Naruto allow_stop', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-test-007';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'stop-gate.json'), JSON.stringify({
    schema: 'sks.stop-gate.v1',
    route: 'Naruto',
    route_command: '$Naruto',
    mission_id: missionId,
    gate_file: 'naruto-gate.json',
    gate_abs_path: path.join(dir, 'stop-gate.json'),
    status: 'passed',
    passed: true,
    terminal: true,
    terminal_state: 'completed',
    evidence: { route_evidence_passed: true, proof_required: false, proof_passed: true, reflection_required: true, reflection_passed: true },
    blockers: [],
    missing_fields: [],
    created_at: new Date().toISOString()
  }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'stop-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto', agents_required: false, proof_required: false, reflection_required: true });

  const decision: any = await evaluateStop(root, { mission_id: missionId, stop_gate: 'stop-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto', agents_required: false, proof_required: false, reflection_required: true }, { message: 'done' });
  assert.equal(decision?.continue, true);
  assert.match(decision?.systemMessage, /canonical stop-gate passed/);
});

test('strict pass rule rejects status blocked or blockers', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-test-008';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'stop-gate.json'), JSON.stringify({
    schema: 'sks.stop-gate.v1',
    route: 'Naruto',
    route_command: '$Naruto',
    mission_id: missionId,
    gate_file: 'naruto-gate.json',
    gate_abs_path: path.join(dir, 'stop-gate.json'),
    status: 'blocked',
    passed: true,
    terminal: true,
    terminal_state: 'completed',
    evidence: {},
    blockers: ['x'],
    missing_fields: [],
    created_at: new Date().toISOString()
  }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'stop-gate.json', mode: 'NARUTO', route: 'Naruto' });
  const result = await checkStopGate({ root, route: 'Naruto' });
  assert.equal(result.action, 'continue');
  assert.ok(result.diagnostics.missing_fields.includes('status'));
  assert.ok(result.diagnostics.missing_fields.includes('blockers'));
});

test('writeFinalStopGate preserves existing native gate fields', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-test-009';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'naruto-gate.json'), JSON.stringify({ schema: 'sks.naruto-gate.v1', clone_roster_built: true, custom_detail: 'keep-me', passed: false }));
  await writeFinalStopGate({
    root,
    missionId,
    route: 'Naruto',
    routeCommand: '$Naruto',
    status: 'passed',
    terminal: true,
    terminalState: 'completed',
    evidence: { route_evidence_passed: true, proof_required: false, proof_passed: true, reflection_required: false, reflection_passed: 'not_required' },
    nativeGateFile: 'naruto-gate.json'
  });
  const native = JSON.parse(await fsp.readFile(path.join(dir, 'naruto-gate.json'), 'utf8'));
  assert.equal(native.clone_roster_built, true);
  assert.equal(native.custom_detail, 'keep-me');
  assert.equal(native.passed, true);
  const canonical = JSON.parse(await fsp.readFile(path.join(dir, 'stop-gate.json'), 'utf8'));
  assert.equal(canonical.schema, 'sks.stop-gate.v1');
});

test('diagnostics are written when no stop gate exists', async () => {
  const root = await makeTempRoot();
  const result = await checkStopGate({ root, route: 'Naruto', missionId: 'M-test-010' });
  assert.equal(result.action, 'continue');
  const diagnostics = JSON.parse(await fsp.readFile(path.join(root, '.sneakoscope', 'reports', 'stop-gate-last-check.json'), 'utf8'));
  assert.equal(diagnostics.reason, 'no_gate_file_found');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { findGlmOnlyMadFlagBlockers, madHighCommand, stripMadLaunchOnlyArgs } from '../mad-sks-command.js';

test('non-GLM MAD fails closed for GLM-only flags instead of silently stripping them', () => {
  assert.deepEqual(findGlmOnlyMadFlagBlockers(['--mad', '--bench'], false), ['glm_flag_requires_--glm:--bench']);
  assert.deepEqual(findGlmOnlyMadFlagBlockers(['--mad', '--trace', '--exact-provider', 'foo'], false), [
    'glm_flag_requires_--glm:--trace',
    'glm_flag_requires_--glm:--exact-provider'
  ]);
  assert.deepEqual(findGlmOnlyMadFlagBlockers(['--mad', '--glm', '--trace'], true), []);
});

test('launch sanitizer strips GLM-only flags only for GLM launches', () => {
  assert.deepEqual(stripMadLaunchOnlyArgs(['--mad', '--deep', '--exact-provider', 'foo'], { includeGlmFlags: false }), ['--deep', '--exact-provider', 'foo']);
  assert.deepEqual(stripMadLaunchOnlyArgs(['--mad', '--deep', '--exact-provider', 'foo'], { includeGlmFlags: true }), []);
});

async function makeMadSksMission(gate: Record<string, unknown>) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mad-sks-status-'));
  const missionId = 'M-mad-sks-status-gate-verdict';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'mission.json'), JSON.stringify({ id: missionId, mode: 'mad-sks', prompt: 'fixture', created_at: new Date().toISOString(), phase: 'PREPARE' }, null, 2));
  await fsp.writeFile(path.join(dir, 'mad-sks-gate.json'), JSON.stringify(gate, null, 2));
  return { root, missionId };
}

test('mad-sks status surfaces gate_verdict.verdict=mock_only for a mock_fixture gate in --json output', async () => {
  const { root } = await makeMadSksMission({ passed: true, ok: true, blockers: [], execution_class: 'mock_fixture' });
  const originalCwd = process.cwd();
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')); };
  try {
    process.chdir(root);
    await madHighCommand(['status', '--json']);
  } finally {
    console.log = originalLog;
    process.chdir(originalCwd);
  }
  const jsonLine = logs.find((line) => line.trim().startsWith('{'));
  assert.ok(jsonLine, 'expected a JSON line to be printed');
  const parsed = JSON.parse(jsonLine as string);
  assert.equal(parsed.gate_verdict.verdict, 'mock_only');
  assert.equal(parsed.gate_verdict.pass, false);
});

test('mad-sks status prints the gate verdict word as the first line in human-readable output', async () => {
  const { root } = await makeMadSksMission({ passed: false, ok: false, blockers: ['fixture_blocker'], execution_class: 'real' });
  const originalCwd = process.cwd();
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')); };
  try {
    process.chdir(root);
    await madHighCommand(['status']);
  } finally {
    console.log = originalLog;
    process.chdir(originalCwd);
  }
  assert.equal(logs[0], 'fail');
});

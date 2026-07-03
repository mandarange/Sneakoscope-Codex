import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { imageUxReviewCommand } from '../image-ux-review-command.js';

async function makeImageUxMission(gate: Record<string, unknown>) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-image-ux-status-'));
  const missionId = 'M-image-ux-status-gate-verdict';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'mission.json'), JSON.stringify({ id: missionId, mode: 'image-ux-review', prompt: 'fixture', phase: 'PREPARE' }, null, 2));
  await fsp.writeFile(path.join(dir, 'image-ux-review-gate.json'), JSON.stringify(gate, null, 2));
  return { root, missionId };
}

test('image-ux-review status surfaces gate_verdict.verdict=mock_only for a mock_fixture gate in --json output', async () => {
  const { root, missionId } = await makeImageUxMission({ passed: true, ok: true, blockers: [], execution_class: 'mock_fixture' });
  const originalCwd = process.cwd();
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')); };
  try {
    process.chdir(root);
    await imageUxReviewCommand('image-ux-review', ['status', missionId, '--json']);
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

test('image-ux-review status prints the gate verdict word as the first line in human-readable output', async () => {
  const { root, missionId } = await makeImageUxMission({ passed: false, ok: false, blockers: ['fixture_blocker'], execution_class: 'real' });
  const originalCwd = process.cwd();
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')); };
  try {
    process.chdir(root);
    await imageUxReviewCommand('image-ux-review', ['status', missionId]);
  } finally {
    console.log = originalLog;
    process.chdir(originalCwd);
  }
  assert.equal(logs[0], 'fail');
});

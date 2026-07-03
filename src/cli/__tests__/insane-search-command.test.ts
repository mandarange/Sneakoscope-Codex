import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { insaneSearchCommand } from '../insane-search-command.js';

async function makeUltraSearchMission(gate: Record<string, unknown> | null): Promise<string> {
  const missionDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-ultra-search-'));
  const artifactDir = path.join(missionDir, 'ultra-search');
  await fsp.mkdir(artifactDir, { recursive: true });
  await fsp.writeFile(path.join(artifactDir, 'ultra-search-result.json'), JSON.stringify({
    schema: 'sks.ultra-search-result.v1',
    ok: true,
    mode: 'fast',
    sources: [],
    proof: { verified_source_count: 0 },
    blockers: [],
  }, null, 2));
  await fsp.writeFile(path.join(artifactDir, 'source-ledger.json'), JSON.stringify({ sources: [] }, null, 2));
  await fsp.writeFile(path.join(artifactDir, 'claim-ledger.json'), JSON.stringify({ claims: [] }, null, 2));
  await fsp.writeFile(path.join(artifactDir, 'ultra-search-proof.json'), JSON.stringify({ ok: true }, null, 2));
  if (gate) {
    await fsp.writeFile(path.join(artifactDir, 'ultra-search-gate.json'), JSON.stringify(gate, null, 2));
  }
  return missionDir;
}

test('insane-search status fails closed when the on-disk gate is execution_class mock_fixture', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const missionDir = await makeUltraSearchMission({ passed: true, ok: true, blockers: [], execution_class: 'mock_fixture' });
  const result: any = await insaneSearchCommand('status', [missionDir, '--json']);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('gate_execution_class_mock_fixture'));
  process.exitCode = previousExit;
});

test('insane-search status fails closed when the on-disk gate has passed:false', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const missionDir = await makeUltraSearchMission({ passed: false, ok: false, blockers: ['some_real_blocker'] });
  const result: any = await insaneSearchCommand('status', [missionDir, '--json']);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('gate_not_passed'));
  process.exitCode = previousExit;
});

test('insane-search status fails closed when the gate file is missing entirely', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const missionDir = await makeUltraSearchMission(null);
  const result: any = await insaneSearchCommand('status', [missionDir, '--json']);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b: string) => b.includes('ultra-search-gate.json') || b.includes('missing')));
  process.exitCode = previousExit;
});

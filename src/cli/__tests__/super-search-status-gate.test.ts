import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { superSearchCommand } from '../super-search-command.js';

async function makeSuperSearchMission(gate: Record<string, unknown> | null, overrides: Record<string, any> = {}): Promise<string> {
  const missionDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-'));
  const artifactDir = path.join(missionDir, 'super-search');
  await fsp.mkdir(artifactDir, { recursive: true });
  const sources = overrides.sources ?? [];
  const claims = overrides.claims ?? [];
  const proof = overrides.proof ?? { verified_source_count: 0 };
  await fsp.writeFile(path.join(artifactDir, 'super-search-result.json'), JSON.stringify({
    schema: 'sks.super-search-result.v1',
    ok: overrides.ok ?? true,
    mode: overrides.mode ?? 'fast',
    sources,
    claims,
    proof,
    blockers: overrides.blockers ?? [],
  }, null, 2));
  await fsp.writeFile(path.join(artifactDir, 'source-ledger.json'), JSON.stringify({ sources }, null, 2));
  await fsp.writeFile(path.join(artifactDir, 'claim-ledger.json'), JSON.stringify({ claims }, null, 2));
  await fsp.writeFile(path.join(artifactDir, 'super-search-proof.json'), JSON.stringify(proof, null, 2));
  if (gate) {
    await fsp.writeFile(path.join(artifactDir, 'super-search-gate.json'), JSON.stringify(gate, null, 2));
  }
  return missionDir;
}

test('super-search status fails closed when the on-disk gate is execution_class mock_fixture', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const missionDir = await makeSuperSearchMission({ passed: true, ok: true, blockers: [], execution_class: 'mock_fixture' });
  const result: any = await superSearchCommand('status', [missionDir, '--json']);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('gate_execution_class_mock_fixture'));
  process.exitCode = previousExit;
});

test('super-search status fails closed when the on-disk gate has passed:false', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const missionDir = await makeSuperSearchMission({ passed: false, ok: false, blockers: ['some_real_blocker'] });
  const result: any = await superSearchCommand('status', [missionDir, '--json']);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('gate_not_passed'));
  process.exitCode = previousExit;
});

test('super-search status fails closed when the gate file is missing entirely', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const missionDir = await makeSuperSearchMission(null);
  const result: any = await superSearchCommand('status', [missionDir, '--json']);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b: string) => b.includes('super-search-gate.json') || b.includes('missing')));
  process.exitCode = previousExit;
});

test('super-search status re-runs real evidence policy instead of trusting a passed gate', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const missionDir = await makeSuperSearchMission(
    { passed: true, ok: true, blockers: [], execution_class: 'production', mock_only: false },
    {
      claims: [{ claim_id: 'claim-forged', status: 'supported', source_ids: [] }],
      proof: { ok: true, mode: 'fast', verified_source_count: 0, mock_only: false },
    }
  );
  const result: any = await superSearchCommand('status', [missionDir, '--json']);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('source_acquisition_unavailable'));
  assert.ok(result.blockers.includes('supported_claim_without_sources'));
  process.exitCode = previousExit;
});

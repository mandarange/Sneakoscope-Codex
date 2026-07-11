import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { finalizeRouteWithProof } from '../../dist/core/proof/route-finalizer.js';
import { latestTrustReport } from '../../dist/core/trust-kernel/trust-report.js';

test('trust kernel writes contract, evidence index, and report for a serious route', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-trust-kernel-'));
  await fs.mkdir(path.join(root, '.sneakoscope/missions/M-fixture'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope/missions/M-fixture/team-gate.json'), '{}\n');
  const result = await finalizeRouteWithProof(root, {
    missionId: 'M-fixture',
    route: '$Team',
    gate: { ok: true, passed: true },
    artifacts: ['team-gate.json'],
    mock: true,
    statusHint: 'verified_partial'
  });
  assert.equal(result.ok, true);
  const report = await latestTrustReport(root, 'M-fixture');
  assert.equal(report.schema, 'sks.trust-report.v1');
  assert.equal(report.status, 'mock_only');
  assert.equal(report.ok, false);
  assert.equal(report.issues.length, 0);
  assert.ok(await fileExists(path.join(root, '.sneakoscope/missions/M-fixture/route-completion-contract.json')));
  assert.ok(await fileExists(path.join(root, '.sneakoscope/missions/M-fixture/evidence-index.json')));
});

test('trust report blocks when completion proof is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-trust-missing-'));
  await fs.mkdir(path.join(root, '.sneakoscope/missions/M-missing'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope/missions/M-missing/mission.json'), '{}\n');
  const report = await latestTrustReport(root, 'M-missing');
  assert.equal(report.status, 'blocked');
  assert.ok(report.issues.includes('completion_proof_missing'));
});

async function fileExists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

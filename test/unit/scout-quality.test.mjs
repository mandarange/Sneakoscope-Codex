import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { maybeFinalizeRoute } from '../../src/core/proof/auto-finalize.mjs';
import { latestTrustReport } from '../../src/core/trust-kernel/trust-report.mjs';

test('trust report exposes scout quality without allowing false real speedup claims', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-quality-'));
  await fs.mkdir(path.join(root, '.sneakoscope/missions/M-scout'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope/missions/M-scout/mission.json'), JSON.stringify({ prompt: 'implement fixture' }));
  await fs.writeFile(path.join(root, '.sneakoscope/missions/M-scout/team-gate.json'), JSON.stringify({ ok: true, passed: true }));
  await maybeFinalizeRoute(root, {
    missionId: 'M-scout',
    route: '$Team',
    gateFile: 'team-gate.json',
    gate: { ok: true, passed: true },
    mock: true,
    statusHint: 'verified_partial'
  });
  const report = await latestTrustReport(root, 'M-scout');
  assert.equal(report.scout_quality.schema, 'sks.scout-quality.v1');
  assert.equal(report.scout_quality.real_parallel, false);
  assert.equal(report.scout_quality.speedup_claim_allowed, false);
  assert.equal(report.scout_quality.confidence, 'verified_partial');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { maybeFinalizeRoute } from '../../dist/core/proof/auto-finalize.js';
import { writeJsonAtomic } from '../../dist/core/fsx.js';
import { latestTrustReport } from '../../dist/core/trust-kernel/trust-report.js';

test('maybeFinalizeRoute writes a route completion proof when gate passes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-auto-finalize-'));
  const missionId = 'M-auto-finalize';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const gate = { passed: true };
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), gate);
  const result = await maybeFinalizeRoute(root, { missionId, route: '$Team', gateFile: 'team-gate.json', gate, mock: true });
  assert.equal(result.ok, true);
  const proof = JSON.parse(await fs.readFile(path.join(dir, 'completion-proof.json'), 'utf8'));
  assert.equal(proof.schema, 'sks.completion-proof.v1');
  assert.equal(proof.route, '$Team');
});

test('maybeFinalizeRoute records native agent fixture artifacts without legacy fallback', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-auto-finalize-agent-artifacts-'));
  const missionId = 'M-auto-finalize-agents';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'mission.json'), JSON.stringify({ prompt: 'fixture' }));
  const gate = { passed: true };
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), gate);

  await maybeFinalizeRoute(root, { missionId, route: '$Team', gateFile: 'team-gate.json', gate, mock: true });

  const proof = JSON.parse(await fs.readFile(path.join(dir, 'completion-proof.json'), 'utf8'));
  assert.ok(proof.evidence.artifacts.some((artifact) => artifact.endsWith('agents/agent-proof-evidence.json')));
  assert.equal(proof.evidence.artifacts.includes('legacy-agent-engine-unavailable.json'), false);

  const trust = await latestTrustReport(root, missionId);
  assert.equal(trust.issues.some((issue) => issue.includes('legacy-agent-engine-unavailable.json')), false);
  assert.equal(trust.status, 'verified_partial');
});

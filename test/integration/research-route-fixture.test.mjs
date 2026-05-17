import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createResearchPlan, evaluateResearchGate, writeMockResearchResult } from '../../src/core/research.mjs';
import { writeRouteCompletionProof } from '../../src/core/proof/route-adapter.mjs';
import { validateRouteCompletionProof } from '../../src/core/proof/route-proof-gate.mjs';

test('Research mock route creates required ledgers, gate, and completion proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-research-fixture-'));
  const missionId = 'M-research-fixture';
  const dir = path.join(root, '.sneakoscope/missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const plan = createResearchPlan('0.9.13 research fixture validation', { title: 'fixture validation' });
  await fs.writeFile(path.join(dir, 'research-plan.json'), JSON.stringify(plan, null, 2));
  const gate = await writeMockResearchResult(dir, plan);
  assert.equal(gate.passed, true);
  for (const file of ['research-report.md', plan.paper_artifact, 'genius-opinion-summary.md', 'research-source-skill.md', 'source-ledger.json', 'scout-ledger.json', 'debate-ledger.json', 'novelty-ledger.json', 'falsification-ledger.json', 'research-gate.json']) {
    await assert.doesNotReject(() => fs.access(path.join(dir, file)), file);
  }
  await writeRouteCompletionProof(root, {
    missionId,
    route: '$Research',
    status: 'verified',
    gate,
    artifacts: ['research-gate.json', 'source-ledger.json', 'scout-ledger.json', 'debate-ledger.json', 'completion-proof.json'],
    claims: [{ id: 'research-fixture-gate', status: 'fixture', text: 'Research fixture gate passed with required ledgers.' }]
  });
  const proofGate = await validateRouteCompletionProof(root, { missionId, route: '$Research' });
  assert.equal(proofGate.ok, true);
});

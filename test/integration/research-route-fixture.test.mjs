import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createResearchPlan, evaluateResearchGate, writeMockResearchResult } from '../../dist/core/research.js';
import { writeRouteCompletionProof } from '../../dist/core/proof/route-adapter.js';
import { validateRouteCompletionProof } from '../../dist/core/proof/route-proof-gate.js';

test('Research mock route creates required ledgers, gate, and completion proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-research-fixture-'));
  const missionId = 'M-research-fixture';
  const dir = path.join(root, '.sneakoscope/missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const plan = createResearchPlan('0.9.13 research fixture validation', { title: 'fixture validation' });
  assert.equal(plan.native_agent_plan.backend, 'native_multi_session_agent_kernel');
  assert.equal(plan.native_agent_plan.legacy_runtime, false);
  assert.ok(plan.native_agent_plan.personas.some((persona) => persona.id === 'research_source_miner'));
  assert.ok(plan.native_agent_plan.personas.some((persona) => persona.id === 'research_skeptic'));
  assert.ok(plan.native_agent_plan.personas.some((persona) => persona.id === 'research_synthesis'));
  assert.ok(plan.native_agent_plan.personas.some((persona) => persona.id === 'research_verifier'));
  assert.equal(plan.autoresearch_cycle_policy.uses_agent_batches, true);
  await fs.writeFile(path.join(dir, 'research-plan.json'), JSON.stringify(plan, null, 2));
  const gate = await writeMockResearchResult(dir, plan);
  assert.equal(gate.passed, true);
  for (const file of ['research-report.md', plan.paper_artifact, 'genius-opinion-summary.md', 'research-source-skill.md', 'source-ledger.json', 'agent-ledger.json', 'debate-ledger.json', 'novelty-ledger.json', 'falsification-ledger.json', 'research-gate.json', 'research-agent-batches.json']) {
    await assert.doesNotReject(() => fs.access(path.join(dir, file)), file);
  }
  const batches = JSON.parse(await fs.readFile(path.join(dir, 'research-agent-batches.json'), 'utf8'));
  assert.equal(batches.backend, 'native_multi_session_agent_kernel');
  assert.equal(batches.status, 'completed_mock');
  assert.ok(batches.batches.some((batch) => batch.agents.includes('research_source_miner')));
  assert.ok(batches.batches.some((batch) => batch.agents.includes('research_skeptic')));
  assert.ok(batches.batches.some((batch) => batch.agents.includes('research_synthesis')));
  assert.ok(batches.batches.some((batch) => batch.agents.includes('research_verifier')));
  await writeRouteCompletionProof(root, {
    missionId,
    route: '$Research',
    status: 'verified',
    gate,
    artifacts: ['research-gate.json', 'source-ledger.json', 'agent-ledger.json', 'debate-ledger.json', 'completion-proof.json'],
    claims: [{ id: 'research-fixture-gate', status: 'fixture', text: 'Research fixture gate passed with required ledgers.' }]
  });
  const proofGate = await validateRouteCompletionProof(root, { missionId, route: '$Research' });
  assert.equal(proofGate.ok, true);
});

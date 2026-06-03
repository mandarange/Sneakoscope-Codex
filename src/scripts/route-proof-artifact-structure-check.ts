#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const issues = [];

for (const rel of [
  'src/core/proof/route-proof-gate.ts',
  'src/core/agents/agent-proof-evidence.ts',
  'src/core/agents/agent-gate.ts',
  'src/core/agents/agent-ledger-schemas.ts'
]) {
  if (!fs.existsSync(path.join(root, rel))) issues.push(`missing:${rel}`);
}

const gateText = read('src/core/proof/route-proof-gate.ts');
for (const token of [
  "agents.status !== 'passed' || agents.ok !== true",
  'agent_no_overlap_not_ok',
  'agent_ledger_hash_chain_not_ok',
  'agent_consensus_not_ok',
  'agent_blockers_present',
  'agent_proof_evidence_missing',
  'agent_count_below_5',
  'agent_count_above_20'
]) {
  if (!gateText.includes(token)) issues.push(`route_gate_missing:${token}`);
}

const agentGateText = read('src/core/agents/agent-gate.ts');
for (const token of ['agent_proof_not_ok', 'agent_proof_status_not_passed', 'agent_count_below_5', 'agent_janitor_missing_or_not_ok']) {
  if (!agentGateText.includes(token)) issues.push(`agent_gate_missing:${token}`);
}

await runNegativeFixture();

const result = {
  schema: 'sks.route-proof-artifact-structure-check.v1',
  ok: issues.length === 0,
  issues
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function read(rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; }
}

async function runNegativeFixture() {
  const built = path.join(root, 'dist', 'core', 'proof', 'route-proof-gate.js');
  if (!fs.existsSync(built)) {
    issues.push('runtime_gate_import_missing');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-route-proof-'));
  const mission = 'M-fixture';
  const missionDir = path.join(tmp, '.sneakoscope', 'missions', mission);
  fs.mkdirSync(missionDir, { recursive: true });
  const proofPath = path.join(missionDir, 'completion-proof.json');
  const baseProof = {
    schema: 'sks.completion-proof.v1',
    version: 'fixture',
    generated_at: '2026-05-25T00:00:00.000Z',
    mission_id: mission,
    status: 'verified',
    route: '$Team',
    summary: { files_changed: 0, commands_run: 0, tests_passed: 0, tests_failed: 0, manual_review_required: false },
    evidence: {
      agents: {
        schema: 'sks.agent-proof-evidence.v1',
        ok: true,
        status: 'blocked',
        agent_count: 5,
        all_sessions_closed: true,
        no_overlap_ok: true,
        ledger_hash_chain_ok: true,
        consensus_ok: true,
        janitor_ok: true,
        blockers: []
      }
    },
    claims: [],
    unverified: [],
    blockers: [],
    next_human_actions: []
  };
  fs.writeFileSync(proofPath, JSON.stringify(baseProof, null, 2));
  const { validateRouteCompletionProof } = await import(pathToFileURL(built).href);
  const result = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Team', state: { agents_required: true } });
  if (result.ok || !result.issues.includes('agent_gate_not_passed')) issues.push('negative_fixture_false_passed_agent_status');
  fs.writeFileSync(proofPath, JSON.stringify({ ...baseProof, evidence: {} }, null, 2));
  const missingAgents = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Team' });
  if (missingAgents.ok || !missingAgents.issues.includes('agent_proof_evidence_missing')) issues.push('negative_fixture_false_passed_missing_agents');
  fs.writeFileSync(proofPath, JSON.stringify({
    ...baseProof,
    evidence: {
      agents: {
        schema: 'sks.agent-proof-evidence.v1',
        ok: true,
        status: 'passed',
        agent_count: 8,
        all_sessions_closed: true,
        no_overlap_ok: true,
        ledger_hash_chain_ok: true,
        consensus_ok: true,
        janitor_ok: true,
        blockers: []
      }
    }
  }, null, 2));
  const scaledAgents = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Team' });
  if (!scaledAgents.ok || scaledAgents.issues.includes('agent_count_not_5')) issues.push('positive_fixture_scaled_agents_failed');
  fs.writeFileSync(proofPath, JSON.stringify({
    ...baseProof,
    evidence: {
      agents: {
        schema: 'sks.agent-proof-evidence.v1',
        ok: true,
        status: 'passed',
        agent_count: 5,
        all_sessions_closed: true,
        no_overlap_ok: true,
        ledger_hash_chain_ok: true,
        consensus_ok: true,
        blockers: []
      }
    }
  }, null, 2));
  const missingJanitor = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Team' });
  if (missingJanitor.ok || !missingJanitor.issues.includes('agent_janitor_missing_or_not_ok')) issues.push('negative_fixture_missing_janitor_false_passed');
  fs.writeFileSync(proofPath, JSON.stringify({ ...baseProof, route: '$Release-Review', evidence: {} }, null, 2));
  const releaseReview = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Release-Review' });
  if (releaseReview.ok || !releaseReview.issues.includes('agent_proof_evidence_missing')) issues.push('negative_fixture_release_review_missing_agents_false_passed');
}

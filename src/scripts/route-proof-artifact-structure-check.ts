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
  'src/core/proof/route-proof-policy.ts',
  'src/core/agents/agent-plan.ts',
  'src/core/subagents/official-subagent-preparation.ts'
]) {
  if (!fs.existsSync(path.join(root, rel))) issues.push(`missing:${rel}`);
}

const gateText = read('src/core/proof/route-proof-gate.ts');
for (const token of [
  'routeRequiresOfficialSubagents',
  'officialSubagentsRequired',
  'official_subagent_route_gate_missing',
  'official_subagent_workflow_missing',
  'official_subagent_evidence_missing',
  'official_subagent_parent_summary_missing'
]) {
  if (!gateText.includes(token)) issues.push(`route_gate_missing:${token}`);
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
    route: '$Naruto',
    execution_class: 'real',
    summary: { files_changed: 0, commands_run: 0, tests_passed: 0, tests_failed: 0, manual_review_required: false },
    evidence: {
      route_gate: {
        workflow: 'official_codex_subagent',
        official_subagent_evidence: true,
        parent_summary_present: true
      }
    },
    claims: [],
    unverified: [],
    blockers: [],
    next_human_actions: []
  };
  const { validateRouteCompletionProof } = await import(pathToFileURL(built).href);

  fs.writeFileSync(proofPath, JSON.stringify({ ...baseProof, evidence: {} }, null, 2));
  const missingRouteGate = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Naruto' });
  if (missingRouteGate.ok || !missingRouteGate.issues.includes('official_subagent_route_gate_missing')) issues.push('negative_fixture_false_passed_missing_subagent_route_gate');

  fs.writeFileSync(proofPath, JSON.stringify({
    ...baseProof,
    evidence: {
      route_gate: {
        workflow: 'invalid_fixture',
        official_subagent_evidence: true,
        parent_summary_present: true
      }
    }
  }, null, 2));
  const wrongWorkflow = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Naruto' });
  if (wrongWorkflow.ok || !wrongWorkflow.issues.includes('official_subagent_workflow_missing')) issues.push('negative_fixture_false_passed_wrong_subagent_workflow');

  fs.writeFileSync(proofPath, JSON.stringify({
    ...baseProof,
    evidence: {
      route_gate: {
        workflow: 'official_codex_subagent',
        official_subagent_evidence: false,
        parent_summary_present: true
      }
    }
  }, null, 2));
  const missingEvidence = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Naruto' });
  if (missingEvidence.ok || !missingEvidence.issues.includes('official_subagent_evidence_missing')) issues.push('negative_fixture_false_passed_missing_subagent_evidence');

  fs.writeFileSync(proofPath, JSON.stringify({
    ...baseProof,
    evidence: {
      route_gate: {
        workflow: 'official_codex_subagent',
        official_subagent_evidence: true,
        parent_summary_present: false
      }
    }
  }, null, 2));
  const missingParentSummary = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Naruto' });
  if (missingParentSummary.ok || !missingParentSummary.issues.includes('official_subagent_parent_summary_missing')) issues.push('negative_fixture_false_passed_missing_subagent_parent_summary');

  fs.writeFileSync(proofPath, JSON.stringify(baseProof, null, 2));
  const completeSubagentProof = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Naruto' });
  if (!completeSubagentProof.ok) issues.push('positive_fixture_official_subagent_proof_failed');

  fs.writeFileSync(proofPath, JSON.stringify({ ...baseProof, route: '$Release-Review', evidence: {} }, null, 2));
  const releaseReview = await validateRouteCompletionProof(tmp, { missionId: mission, route: '$Release-Review' });
  if (releaseReview.ok || !releaseReview.issues.includes('official_subagent_route_gate_missing')) issues.push('negative_fixture_release_review_missing_subagent_gate_false_passed');
}

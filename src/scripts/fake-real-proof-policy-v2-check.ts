#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/proof/fake-real-proof-policy.js');
const official = mod.evaluateFakeRealProofPolicy({
  ...passingOfficialEvidence(),
  work_graph_quality_score: 0.8,
  cleanup_proof: { ok: true }
});
const requiredMissing = mod.evaluateFakeRealProofPolicy({
  require_official_subagents: true
});
const zellij = mod.evaluateFakeRealProofPolicy({ backend: 'zellij', zellij_pane_verified: true, work_graph_quality_score: 0.8, cleanup_proof: { ok: true } });

assertGate(official.schema === 'sks.fake-real-proof-policy.v3', 'fake-real proof policy schema must be v3', official);
assertGate(official.proof_level === 'proven' && official.real_claims.length === 1, 'official subagent evidence must be the only real execution claim', official);
assertGate(requiredMissing.proof_level === 'real_required_missing' && requiredMissing.ok === false, 'required missing official subagent evidence must block', requiredMissing);
assertGate(zellij.proof_level === 'integration_optional' && zellij.subsystem_levels.zellij_pane === 'proven', 'Zellij proof must remain supporting-only', zellij);
assertGate(zellij.subsystem_levels.cleanup === 'proven', 'cleanup proof level must be included', zellij);
assertGate(zellij.subsystem_levels.work_graph === 'proven', 'work graph proof level must be included', zellij);
assertGate(Object.values(official.subsystems).filter((row) => row.evidence_role === 'execution_authority').length === 1, 'exactly one execution authority must exist', official);
emitGate('proof:fake-real-policy-v3', { official: official.proof_level, required_missing: requiredMissing.proof_level, supporting: zellij.proof_level });

function passingOfficialEvidence() {
  const runId = 'proof-policy-v3-check';
  return {
    subagent_plan: {
      schema: 'sks.subagent-plan.v1', workflow: 'official_codex_subagent', route: '$Naruto', workflow_run_id: runId,
      requested_subagents: 1, max_depth: 1, config_blockers: [],
      wave_lifecycle: { count_policy: 'exact', target_subagents: 1 }
    },
    subagent_evidence: {
      schema: 'sks.subagent-evidence.v1', workflow: 'official_codex_subagent', run_id: runId,
      requested_subagents: 1, count_policy: 'exact', target_subagents: 1, started_threads: 1, completed_threads: 1, failed_threads: 0,
      open_thread_ids: [], event_sources: ['SubagentStart', 'SubagentStop'], parent_summary_present: true,
      parent_summary_trustworthy: true, parent_summary_status: 'completed', preparation_only: false,
      status: 'completed', ok: true, blockers: []
    },
    naruto_summary: {
      schema: 'sks.naruto-subagent-workflow.v1', workflow: 'official_codex_subagent', route: '$Naruto', workflow_run_id: runId,
      requested_subagents: 1, count_policy: 'exact', target_subagents: 1, status: 'completed', ok: true, completion_evidence: true, parent_summary_present: true, blockers: []
    },
    naruto_gate: {
      schema: 'sks.naruto-gate.v1', workflow: 'official_codex_subagent', route: '$Naruto', workflow_run_id: runId,
      requested_subagents: 1, count_policy: 'exact', target_subagents: 1, status: 'passed', passed: true, terminal: true, terminal_state: 'completed',
      official_subagent_evidence: true, subagent_evidence_ready: true, parent_summary_present: true,
      session_cleanup: true, native_process_proof_required: false, blockers: []
    }
  };
}

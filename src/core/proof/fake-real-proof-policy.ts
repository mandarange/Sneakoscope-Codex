import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const FAKE_REAL_PROOF_POLICY_SCHEMA = 'sks.fake-real-proof-policy.v2'

export type ProofLevel = 'fixture_only' | 'fixture_instrumented_real' | 'proven' | 'integration_optional' | 'real_required_missing' | 'partial' | 'blocked'

export interface FakeRealProofPolicyReport {
  schema: typeof FAKE_REAL_PROOF_POLICY_SCHEMA
  generated_at: string
  ok: boolean
  proof_level: ProofLevel
  fake_claims: string[]
  real_claims: string[]
  integration_optional: string[]
  subsystems: Record<string, {
    proof_level: ProofLevel
    evidence_artifacts: string[]
    blockers: string[]
    next_action: string
    required_mode: boolean
  }>
  subsystem_levels: Record<string, ProofLevel>
  blockers: string[]
}

export function evaluateFakeRealProofPolicy(input: any = {}): FakeRealProofPolicyReport {
  const backend = String(input.backend || input.agent_orchestration?.backend || '')
  const zellijPane = input.zellij_pane_verified === true || input.real_truth_summary?.zellij_pane_verified === true
  const realParallel = input.real_parallel_claim === true
  const realCodex = backend === 'codex-exec' && realParallel
  const outputSchema = input.output_schema_used === true || input.real_codex_dynamic_smoke?.output_schema_used === true
  const outputLast = Boolean(input.output_last_message_path || input.real_codex_dynamic_smoke?.output_last_message_path)
  const realUnavailable = input.integration_optional === true || input.real_codex_dynamic_smoke?.status === 'integration_optional'
  const codexPatchSmoke = input.real_codex_patch_smoke || input.codex_patch_envelope_smoke || null
  const realCodexPatchRequired = input.require_real_codex_patches === true || process.env.SKS_REQUIRE_REAL_CODEX_PATCHES === '1'
  const codexPatchLevel: ProofLevel = codexPatchSmoke?.proof_level === 'proven' ? 'proven'
    : codexPatchSmoke?.proof_level === 'fixture_instrumented_real' ? 'fixture_instrumented_real'
    : codexPatchSmoke?.proof_level === 'real_required_missing' || realCodexPatchRequired ? 'real_required_missing'
    : codexPatchSmoke?.status === 'integration_optional' || !codexPatchSmoke ? 'integration_optional'
    : codexPatchSmoke?.ok === false ? 'blocked'
    : 'integration_optional'
  const fixtureInstrumented = input.fixture_instrumented_real === true
    || input.real_codex_dynamic_smoke?.fixture_instrumented_real === true
    || input.real_codex_dynamic_smoke?.status === 'fixture_instrumented_real'
    || process.env.SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE === '1'
  const realCodexRequired = input.require_real_dynamic_agents === true || process.env.SKS_REQUIRE_REAL_DYNAMIC_AGENTS === '1'
  const realZellijRequired = input.require_real_zellij === true || process.env.SKS_REQUIRE_ZELLIJ === '1'
  const routeBlackboxKind = String(input.route_blackbox_kind || '')
  const sourceIntelligenceOk = input.source_intelligence?.ok === true
    || input.source_intelligence_generation_refs_ok === true
    || input.task_graph_source_refs_ok === true
  const goalModeOk = input.goal_mode?.ok === true
    || input.goal_mode_generation_refs_ok === true
    || input.task_graph_goal_refs_ok === true
  const dynamicSchedulerOk = input.scheduler_state === 'agent-scheduler-state.json'
    || input.scheduler?.pending_queue_drained === true
    || input.pending_queue_drained === true
  const warpMadRequired = input.require_warp_mad_lanes === true || process.env.SKS_REQUIRE_WARP_MAD_LANES === '1'
  const warpMadProof = input.warp_mad_lanes || input.mad_sks_zellij_lane_ui || null
  const warpMadLevel: ProofLevel = warpMadProof?.ok === true ? 'proven'
    : warpMadRequired ? 'real_required_missing'
    : warpMadProof ? 'blocked'
    : 'integration_optional'
  const cleanupLevel: ProofLevel = input.cleanup_proof?.ok === true || input.real_truth_summary?.cleanup_executor_status === 'passed' ? 'proven'
    : input.cleanup_proof || input.real_truth_summary?.cleanup_executor_status === 'blocked' ? 'blocked'
    : 'integration_optional'
  const graphScore = Number(input.work_graph_quality_score ?? input.real_truth_summary?.work_graph_quality_score ?? 0)
  const workGraphLevel: ProofLevel = graphScore >= 0.7 ? 'proven' : graphScore >= 0.35 ? 'partial' : 'blocked'
  const fakeClaims = [
    ...(backend === 'fake' ? ['fake_backend_evidence'] : []),
    ...(routeBlackboxKind.includes('fixture') || routeBlackboxKind.includes('mock') ? ['fixture_route_blackbox'] : [])
  ]
  const realClaims = [
    ...(zellijPane ? ['zellij_pane_evidence'] : []),
    ...(realCodex && outputSchema && outputLast ? ['real_codex_output_schema_evidence'] : [])
  ]
  const integrationOptional = [
    ...(realUnavailable ? ['real_runtime_smoke_unavailable'] : []),
    ...(backend === 'zellij' && !zellijPane ? ['real_zellij_requires_pane_evidence'] : [])
  ]
  const blockers = [
    ...(backend === 'fake' && input.real_parallel_claim === true ? ['fake_backend_claimed_real_parallel'] : []),
    ...(backend === 'zellij' && !zellijPane && realUnavailable !== true && realZellijRequired ? ['real_zellij_missing_pane_evidence'] : []),
    ...(realCodex && (!outputSchema || !outputLast) && realUnavailable !== true && realCodexRequired ? ['real_codex_missing_output_schema_or_last_message'] : []),
    ...(realCodexRequired && realUnavailable ? ['real_dynamic_agents_required_missing'] : []),
    ...(realCodexPatchRequired && codexPatchLevel !== 'proven' && codexPatchLevel !== 'fixture_instrumented_real' ? ['real_codex_patch_smoke_required_missing'] : []),
    ...(realZellijRequired && backend === 'zellij' && !zellijPane ? ['real_zellij_required_missing'] : []),
    ...(warpMadRequired && warpMadLevel !== 'proven' ? ['warp_mad_lanes_required_missing'] : []),
    ...(input.real_route_command_used === false ? ['route_standin_cannot_satisfy_real_route'] : [])
  ]
  const proofLevel: ProofLevel = blockers.some((row) => row.includes('required_missing')) ? 'real_required_missing'
    : blockers.length ? 'blocked'
    : fixtureInstrumented && realCodex ? 'fixture_instrumented_real'
    : realClaims.length ? 'proven'
    : integrationOptional.length ? 'integration_optional'
    : fakeClaims.length ? 'fixture_only'
    : 'fixture_only'
  const subsystems: FakeRealProofPolicyReport['subsystems'] = {
    agent_backend: row(backend === 'fake' ? 'fixture_only' : proofLevel, ['agent-proof-evidence.json'], backend === 'fake' ? 'fixture backend cannot satisfy real runtime proof' : 'backend proof recorded', false, backend === 'fake' ? ['fake_backend_evidence'] : []),
    zellij_pane: row(zellijPane ? 'proven' : backend === 'zellij' && realZellijRequired ? 'real_required_missing' : backend === 'zellij' ? 'integration_optional' : 'fixture_only', ['zellij-pane-proof.json'], zellijPane ? 'Zellij pane proof present' : realZellijRequired ? 'run with real Zellij pane evidence' : 'run SKS_REQUIRE_ZELLIJ=1 for live proof', realZellijRequired, backend === 'zellij' && realZellijRequired && !zellijPane ? ['real_zellij_required_missing'] : []),
    codex_dynamic: row(fixtureInstrumented && realCodex ? 'fixture_instrumented_real' : realCodex && outputSchema && outputLast ? 'proven' : realCodexRequired ? 'real_required_missing' : realUnavailable ? 'integration_optional' : 'fixture_only', ['agent-real-codex-dynamic-smoke.json'], realCodex && outputSchema && outputLast ? 'Codex dynamic smoke has schema/result evidence' : realCodexRequired ? 'run real Codex dynamic smoke with output schema/result proof' : 'run SKS_TEST_REAL_DYNAMIC_AGENTS=1 for live proof', realCodexRequired, realCodexRequired && (!outputSchema || !outputLast || realUnavailable) ? ['real_dynamic_agents_required_missing'] : []),
    codex_patch_envelope_smoke: row(codexPatchLevel, ['agent-real-codex-patch-envelope-smoke.json'], codexPatchLevel === 'proven' ? 'real Codex patch envelope smoke applied through patch swarm' : realCodexPatchRequired ? 'run SKS_TEST_REAL_CODEX_PATCHES=1 with real Codex patch envelopes' : 'run SKS_TEST_REAL_CODEX_PATCHES=1 for live patch envelope smoke', realCodexPatchRequired, realCodexPatchRequired && codexPatchLevel !== 'proven' && codexPatchLevel !== 'fixture_instrumented_real' ? ['real_codex_patch_smoke_required_missing'] : []),
    cleanup: row(cleanupLevel, ['agent-cleanup-proof.json'], cleanupLevel === 'proven' ? 'cleanup after-state verified' : 'run agent cleanup executor v2', false, cleanupLevel === 'blocked' ? ['cleanup_proof_blocked'] : []),
    intelligent_work_graph: row(workGraphLevel, ['agent-intelligent-work-graph-v2.json', 'agent-symbol-ownership-map.json'], workGraphLevel === 'proven' ? 'AST work graph quality sufficient' : workGraphLevel === 'partial' ? 'raise AST coverage or ownership confidence' : 'build AST-aware work graph evidence', false, workGraphLevel === 'blocked' ? ['work_graph_quality_too_low'] : []),
    source_intelligence: row(sourceIntelligenceOk ? 'proven' : 'integration_optional', ['source-intelligence-evidence.json'], sourceIntelligenceOk ? 'source intelligence refs are present' : 'hydrate source intelligence evidence before risky claims', false, []),
    goal_mode: row(goalModeOk ? 'proven' : 'integration_optional', ['goal-mode-applied.json'], goalModeOk ? 'Goal mode refs are present' : 'record official goal mode evidence', false, []),
    route_blackbox: row(routeBlackboxKind.includes('fixture') || routeBlackboxKind.includes('mock') ? 'fixture_only' : input.real_route_command_used === false ? 'blocked' : 'proven', ['agent-proof-evidence.json'], input.real_route_command_used === false ? 'use actual route command, not a stand-in' : 'route command truth recorded', false, input.real_route_command_used === false ? ['route_standin_cannot_satisfy_real_route'] : []),
    dynamic_scheduler: row(dynamicSchedulerOk ? 'proven' : 'partial', ['agent-scheduler-state.json'], dynamicSchedulerOk ? 'scheduler drain/backfill proof present' : 'record scheduler drain and backfill proof', false, []),
    warp_mad_lanes: row(warpMadLevel, ['zellij-pane-proof.json'], warpMadLevel === 'proven' ? 'MAD Zellij lane UI proof present' : warpMadRequired ? 'open visible Zellij lane UI or record blocker' : 'run sks --mad with Zellij for live lane proof', warpMadRequired, warpMadLevel === 'blocked' || warpMadLevel === 'real_required_missing' ? ['warp_mad_lane_ui_missing'] : [])
  }
  const subsystemLevels: Record<string, ProofLevel> = Object.fromEntries(Object.entries(subsystems).map(([key, value]) => [key, value.proof_level]))
  subsystemLevels.backend = subsystemLevels.agent_backend || proofLevel
  subsystemLevels.work_graph = subsystemLevels.intelligent_work_graph || workGraphLevel
  return {
    schema: FAKE_REAL_PROOF_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    proof_level: proofLevel,
    fake_claims: fakeClaims,
    real_claims: realClaims,
    integration_optional: integrationOptional,
    subsystems,
    subsystem_levels: subsystemLevels,
    blockers
  }
}

function row(
  proofLevel: ProofLevel,
  evidenceArtifacts: string[],
  nextAction: string,
  requiredMode: boolean,
  blockers: string[]
) {
  return {
    proof_level: proofLevel,
    evidence_artifacts: evidenceArtifacts,
    blockers,
    next_action: nextAction,
    required_mode: requiredMode
  }
}

export async function writeFakeRealProofPolicyReport(root: string, input: any = {}) {
  const proof = input?.schema ? input : await readJson(path.join(root, 'agent-proof-evidence.json'), {})
  const report = evaluateFakeRealProofPolicy(proof)
  await writeJsonAtomic(path.join(root, 'fake-real-proof-policy.json'), report)
  return report
}

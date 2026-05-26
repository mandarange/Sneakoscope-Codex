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
  subsystem_levels: Record<string, ProofLevel>
  blockers: string[]
}

export function evaluateFakeRealProofPolicy(input: any = {}): FakeRealProofPolicyReport {
  const backend = String(input.backend || input.agent_orchestration?.backend || '')
  const physicalTmux = input.physical_tmux_verified === true || input.real_truth_summary?.physical_tmux_verified === true
  const realParallel = input.real_parallel_claim === true
  const realCodex = backend === 'codex-exec' && realParallel
  const outputSchema = input.output_schema_used === true || input.real_codex_dynamic_smoke?.output_schema_used === true
  const outputLast = Boolean(input.output_last_message_path || input.real_codex_dynamic_smoke?.output_last_message_path)
  const realUnavailable = input.integration_optional === true || input.real_codex_dynamic_smoke?.status === 'integration_optional'
  const fixtureInstrumented = input.fixture_instrumented_real === true
    || input.real_codex_dynamic_smoke?.fixture_instrumented_real === true
    || input.real_codex_dynamic_smoke?.status === 'fixture_instrumented_real'
    || process.env.SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE === '1'
  const realCodexRequired = input.require_real_dynamic_agents === true || process.env.SKS_REQUIRE_REAL_DYNAMIC_AGENTS === '1'
  const realTmuxRequired = input.require_real_tmux === true || process.env.SKS_REQUIRE_REAL_TMUX === '1'
  const cleanupLevel: ProofLevel = input.cleanup_proof?.ok === true || input.real_truth_summary?.cleanup_executor_status === 'passed' ? 'proven'
    : input.cleanup_proof || input.real_truth_summary?.cleanup_executor_status === 'blocked' ? 'blocked'
    : 'integration_optional'
  const graphScore = Number(input.work_graph_quality_score ?? input.real_truth_summary?.work_graph_quality_score ?? 0)
  const workGraphLevel: ProofLevel = graphScore >= 0.7 ? 'proven' : graphScore >= 0.35 ? 'partial' : 'blocked'
  const fakeClaims = [
    ...(backend === 'fake' ? ['fake_backend_evidence'] : []),
    ...(String(input.route_blackbox_kind || '').includes('fixture') ? ['fixture_route_blackbox'] : [])
  ]
  const realClaims = [
    ...(physicalTmux ? ['physical_tmux_pane_evidence'] : []),
    ...(realCodex && outputSchema && outputLast ? ['real_codex_output_schema_evidence'] : [])
  ]
  const integrationOptional = [
    ...(realUnavailable ? ['real_runtime_smoke_unavailable'] : []),
    ...(backend === 'tmux' && !physicalTmux ? ['real_tmux_requires_physical_pane_evidence'] : [])
  ]
  const blockers = [
    ...(backend === 'fake' && input.real_parallel_claim === true ? ['fake_backend_claimed_real_parallel'] : []),
    ...(backend === 'tmux' && !physicalTmux && realUnavailable !== true && realTmuxRequired ? ['real_tmux_missing_physical_pane_evidence'] : []),
    ...(realCodex && (!outputSchema || !outputLast) && realUnavailable !== true && realCodexRequired ? ['real_codex_missing_output_schema_or_last_message'] : []),
    ...(realCodexRequired && realUnavailable ? ['real_dynamic_agents_required_missing'] : []),
    ...(realTmuxRequired && backend === 'tmux' && !physicalTmux ? ['real_tmux_required_missing'] : []),
    ...(input.real_route_command_used === false ? ['route_standin_cannot_satisfy_real_route'] : [])
  ]
  const proofLevel: ProofLevel = blockers.some((row) => row.includes('required_missing')) ? 'real_required_missing'
    : blockers.length ? 'blocked'
    : fixtureInstrumented && realCodex ? 'fixture_instrumented_real'
    : realClaims.length ? 'proven'
    : integrationOptional.length ? 'integration_optional'
    : fakeClaims.length ? 'fixture_only'
    : 'fixture_only'
  const subsystemLevels: Record<string, ProofLevel> = {
    backend: backend === 'fake' ? 'fixture_only' : proofLevel,
    tmux_physical: physicalTmux ? 'proven' : backend === 'tmux' && realTmuxRequired ? 'real_required_missing' : backend === 'tmux' ? 'integration_optional' : 'fixture_only',
    codex_dynamic: fixtureInstrumented && realCodex ? 'fixture_instrumented_real' : realCodex && outputSchema && outputLast ? 'proven' : realCodexRequired ? 'real_required_missing' : realUnavailable ? 'integration_optional' : 'fixture_only',
    cleanup: cleanupLevel,
    work_graph: workGraphLevel
  }
  return {
    schema: FAKE_REAL_PROOF_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    proof_level: proofLevel,
    fake_claims: fakeClaims,
    real_claims: realClaims,
    integration_optional: integrationOptional,
    subsystem_levels: subsystemLevels,
    blockers
  }
}

export async function writeFakeRealProofPolicyReport(root: string, input: any = {}) {
  const proof = input?.schema ? input : await readJson(path.join(root, 'agent-proof-evidence.json'), {})
  const report = evaluateFakeRealProofPolicy(proof)
  await writeJsonAtomic(path.join(root, 'fake-real-proof-policy.json'), report)
  return report
}

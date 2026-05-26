import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const FAKE_REAL_PROOF_POLICY_SCHEMA = 'sks.fake-real-proof-policy.v1'

export type ProofLevel = 'fixture_only' | 'proven' | 'integration_optional' | 'blocked'

export interface FakeRealProofPolicyReport {
  schema: typeof FAKE_REAL_PROOF_POLICY_SCHEMA
  generated_at: string
  ok: boolean
  proof_level: ProofLevel
  fake_claims: string[]
  real_claims: string[]
  integration_optional: string[]
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
    ...(backend === 'tmux' && !physicalTmux && realUnavailable !== true ? ['real_tmux_missing_physical_pane_evidence'] : []),
    ...(realCodex && (!outputSchema || !outputLast) && realUnavailable !== true ? ['real_codex_missing_output_schema_or_last_message'] : []),
    ...(input.real_route_command_used === false ? ['route_standin_cannot_satisfy_real_route'] : [])
  ]
  const proofLevel: ProofLevel = blockers.length ? 'blocked'
    : realClaims.length ? 'proven'
    : integrationOptional.length ? 'integration_optional'
    : fakeClaims.length ? 'fixture_only'
    : 'fixture_only'
  return {
    schema: FAKE_REAL_PROOF_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    proof_level: proofLevel,
    fake_claims: fakeClaims,
    real_claims: realClaims,
    integration_optional: integrationOptional,
    blockers
  }
}

export async function writeFakeRealProofPolicyReport(root: string, input: any = {}) {
  const proof = input?.schema ? input : await readJson(path.join(root, 'agent-proof-evidence.json'), {})
  const report = evaluateFakeRealProofPolicy(proof)
  await writeJsonAtomic(path.join(root, 'fake-real-proof-policy.json'), report)
  return report
}

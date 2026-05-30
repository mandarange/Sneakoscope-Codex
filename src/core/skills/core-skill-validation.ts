import type { HeldoutValidationResult } from './core-skill-types.js'

export interface HeldoutValidationInput {
  baselineHeldout: number
  candidateHeldout: number
  sideEffectZero: boolean
  requestedScopeCompliant: boolean
  proofCompletenessBaseline: number
  proofCompletenessCandidate: number
  rollbackReadyBaseline: number
  rollbackReadyCandidate: number
  latencyBaselineMs: number
  latencyCandidateMs: number
  // A candidate is only catastrophically worse on latency past this multiple.
  latencyCatastrophicMultiple?: number
}

/**
 * Strict held-out acceptance. A candidate skill is accepted ONLY when its held-out
 * score strictly improves AND no safety/quality dimension regresses. Train-only
 * improvement with worse held-out is rejected.
 */
export function validateHeldout(input: HeldoutValidationInput): HeldoutValidationResult {
  const delta = input.candidateHeldout - input.baselineHeldout
  const result = (accept: boolean, reason: string): HeldoutValidationResult => ({
    accept,
    reason,
    baseline_heldout: input.baselineHeldout,
    candidate_heldout: input.candidateHeldout,
    score_delta: Number(delta.toFixed(6))
  })
  if (!(input.candidateHeldout > input.baselineHeldout)) return result(false, 'heldout_not_improved')
  if (!input.sideEffectZero) return result(false, 'side_effect_zero_failed')
  if (!input.requestedScopeCompliant) return result(false, 'requested_scope_violation')
  if (input.proofCompletenessCandidate < input.proofCompletenessBaseline) return result(false, 'proof_completeness_worse')
  if (input.rollbackReadyCandidate < input.rollbackReadyBaseline) return result(false, 'rollback_readiness_worse')
  const catastrophic = (input.latencyCatastrophicMultiple ?? 3) * Math.max(input.latencyBaselineMs, 1)
  if (input.latencyCandidateMs > catastrophic) return result(false, 'latency_catastrophically_worse')
  return result(true, 'strict_improvement')
}

import { CORE_SKILL_PATCH_SCHEMA, type CoreRolloutTrace, type CoreSkillCard, type CoreSkillPatch } from './core-skill-types.js'
import { saveCard } from './core-skill-card.js'
import { patchHash, validatePatch } from './core-skill-patch.js'
import { applyPatch } from './core-skill-patch-apply.js'
import { validateHeldout, type HeldoutValidationInput } from './core-skill-validation.js'
import { isPatchRejected, recordRejectedPatch } from './rejected-skill-patch-buffer.js'
import { assertNotInDeployment } from './core-skill-deployment.js'

export const DEFAULT_TEXTUAL_LEARNING_RATE = { max_added_chars: 800, max_deleted_chars: 400, max_replaced_chars: 600 }

/**
 * Pure, no-model-call optimizer. Proposes a single bounded SkillPatch from scored
 * rollouts using deterministic heuristics (reinforce verification when proof is
 * thin; add a rollback instruction when rollback readiness is weak). Returns null
 * when there is nothing safe to improve. Forbidden in deployment context.
 */
export function proposeSkillPatch(card: CoreSkillCard, traces: CoreRolloutTrace[]): CoreSkillPatch | null {
  assertNotInDeployment('proposeSkillPatch')
  if (!traces.length) return null
  const proofThin = traces.some((t) => t.proof_artifacts.length === 0 && !t.failure_reason)
  const rollbackWeak = traces.some((t) => !t.rollback_ready)
  const operations: CoreSkillPatch['operations'] = []
  if (proofThin && !/proof artifact/i.test(card.body)) {
    operations.push({ op: 'add', target: 'section:verification', text: '- Always emit a proof artifact before reporting success.' })
  }
  if (rollbackWeak && !/rollback/i.test(card.body)) {
    operations.push({ op: 'add', target: 'section:rollback', text: '- Record a rollback-ready checkpoint before mutating anything.' })
  }
  if (!operations.length) return null
  return {
    schema: CORE_SKILL_PATCH_SCHEMA,
    skill_id: card.skill_id,
    base_version: card.version,
    operations,
    textual_learning_rate: { ...DEFAULT_TEXTUAL_LEARNING_RATE }
  }
}

export interface SkillEpochInput {
  card: CoreSkillCard
  trainTraces: CoreRolloutTrace[]
  validation: HeldoutValidationInput
  patch?: CoreSkillPatch
}

export interface SkillEpochResult {
  accepted: boolean
  reason: string
  patch_hash: string | null
  score_delta: number
  candidate: CoreSkillCard | null
  saved_path?: string | null
}

/**
 * Run one optimizer epoch in a TRAINING/EVALUATION context. Produces at most one
 * accepted candidate (never a deployed snapshot). Rejected patches are buffered so
 * the same failed edit is not proposed again. Never mutates code/config/global files.
 */
export async function runSkillEpoch(root: string, input: SkillEpochInput): Promise<SkillEpochResult> {
  assertNotInDeployment('runSkillEpoch')
  const patch = input.patch ?? proposeSkillPatch(input.card, input.trainTraces)
  if (!patch) return { accepted: false, reason: 'no_proposal', patch_hash: null, score_delta: 0, candidate: null }
  const hash = patchHash(patch)
  if (await isPatchRejected(root, hash)) {
    return { accepted: false, reason: 'already_rejected', patch_hash: hash, score_delta: 0, candidate: null }
  }
  const validation = validatePatch(patch, input.card)
  if (!validation.ok) {
    await recordRejectedPatch(root, { skill_id: patch.skill_id, base_version: patch.base_version, patch_hash: hash, reason: `patch_invalid:${validation.blockers[0]}`, score_delta: 0 })
    return { accepted: false, reason: 'patch_invalid', patch_hash: hash, score_delta: 0, candidate: null }
  }
  const applied = applyPatch(input.card, patch)
  if (!applied.ok || !applied.candidate) {
    await recordRejectedPatch(root, { skill_id: patch.skill_id, base_version: patch.base_version, patch_hash: hash, reason: `apply_failed:${applied.blockers[0]}`, score_delta: 0 })
    return { accepted: false, reason: 'apply_failed', patch_hash: hash, score_delta: 0, candidate: null }
  }
  const heldout = validateHeldout(input.validation)
  if (!heldout.accept) {
    await recordRejectedPatch(root, { skill_id: patch.skill_id, base_version: patch.base_version, patch_hash: hash, reason: heldout.reason, score_delta: heldout.score_delta })
    return { accepted: false, reason: heldout.reason, patch_hash: hash, score_delta: heldout.score_delta, candidate: null }
  }
  const accepted: CoreSkillCard = {
    ...applied.candidate,
    status: 'accepted',
    validation: { heldout_score: input.validation.candidateHeldout, baseline_score: input.validation.baselineHeldout, strict_improvement: true }
  }
  const savedPath = await saveCard(root, accepted)
  return { accepted: true, reason: 'strict_improvement', patch_hash: hash, score_delta: heldout.score_delta, candidate: accepted, saved_path: savedPath }
}

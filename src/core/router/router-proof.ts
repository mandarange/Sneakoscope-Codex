import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import type { CodexTaskInput } from '../codex-control/codex-control-plane.js'
import type { UltraRouterDecision } from './ultra-router.js'

export const ULTRA_ROUTER_PROOF_SCHEMA = 'sks.ultra-router-proof.v1'

export async function writeUltraRouterProof(root: string, input: {
  task: CodexTaskInput
  decision: UltraRouterDecision
}) {
  const proof = {
    schema: ULTRA_ROUTER_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: Boolean(input.decision.selected_profile),
    route: input.task.route,
    mission_id: input.task.missionId,
    work_item_id: input.task.workItemId || null,
    slot_id: input.task.slotId || null,
    selected_profile: input.decision.selected_profile,
    reason: input.decision.reason,
    scores: input.decision.scores,
    costs: input.decision.costs,
    cache_hit: input.decision.cache_hit,
    tier: input.decision.tier,
    classifier_never_sees_cost: true,
    hard_filters: input.decision.hard_filters,
    classification: input.decision.classification
  }
  const proofPath = path.join(root, 'ultra-router-proof.json')
  await writeJsonAtomic(proofPath, proof)
  return { proof, proofPath }
}

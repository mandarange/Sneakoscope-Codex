import { nowIso } from '../fsx.js'

export const AGENT_PATCH_PROOF_SCHEMA = 'sks.agent-patch-proof.v1'

export function buildAgentPatchProof(input: {
  queue?: any
  merge?: any
  applyResults?: any[]
  verification?: string[]
} = {}) {
  const applyResults = input.applyResults || []
  const blockers = [
    ...(input.merge?.blockers || []),
    ...applyResults.flatMap((applyResult) => applyResult.ok ? [] : (applyResult.violations || ['patch_apply_failed']))
  ].map(String)
  return {
    schema: AGENT_PATCH_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    queued_count: input.queue?.queued_count ?? input.queue?.entries?.length ?? 0,
    changed_files: [...new Set(applyResults.flatMap((applyResult) => applyResult.changed_files || []))],
    rollback_digests: applyResults.map((applyResult) => applyResult.rollback_digest).filter(Boolean),
    merge: input.merge || null,
    verification: input.verification || [],
    blockers
  }
}

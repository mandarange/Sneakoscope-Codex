import { nowIso } from '../fsx.js'

export const AGENT_PATCH_PROOF_SCHEMA = 'sks.agent-patch-proof.v1'

export function buildAgentPatchProof(input: {
  queue?: any
  merge?: any
  applyResults?: any[]
  verification?: string[]
} = {}) {
  const applyResults = input.applyResults || []
  const queueEntries = Array.isArray(input.queue?.entries) ? input.queue.entries : []
  const queuedCount = input.queue?.queued_count ?? queueEntries.filter((entry: any) => entry?.status === 'pending').length
  const queueBlockers = [
    ...(queuedCount > 0 ? [`queue_pending_count:${queuedCount}`] : []),
    ...queueEntries.flatMap((entry: any) => {
      const id = String(entry?.id || 'unknown')
      const status = String(entry?.status || 'missing')
      const statusBlockers = status === 'applied' || status === 'verified' ? [] : [`queue_entry_not_applied:${id}:${status}`]
      const violationBlockers = Array.isArray(entry?.violations) ? entry.violations.map((violation: any) => `queue_entry_violation:${id}:${String(violation)}`) : []
      return [...statusBlockers, ...violationBlockers]
    })
  ]
  const rollbackBlockers = applyResults.flatMap((applyResult, index) => {
    const changed = Array.isArray(applyResult?.changed_files) && applyResult.changed_files.length > 0
    return applyResult?.ok && changed && !applyResult.rollback_digest ? [`missing_rollback_digest:${index}`] : []
  })
  const blockers = [
    ...(input.merge && input.merge.ok === false ? ['merge_not_ok'] : []),
    ...(input.merge?.blockers || []),
    ...queueBlockers,
    ...rollbackBlockers,
    ...applyResults.flatMap((applyResult) => applyResult.ok ? [] : (applyResult.violations || ['patch_apply_failed']))
  ].map(String)
  return {
    schema: AGENT_PATCH_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    queued_count: queuedCount,
    queue_event_count: input.queue?.events?.length || 0,
    ownership_ledger: input.queue?.ownership_ledger || [],
    changed_files: [...new Set(applyResults.flatMap((applyResult) => applyResult.changed_files || []))],
    rollback_digests: applyResults.map((applyResult) => applyResult.rollback_digest).filter(Boolean),
    rollback_ready: applyResults.length > 0 && applyResults.every((applyResult) => !Array.isArray(applyResult.changed_files) || applyResult.changed_files.length === 0 || applyResult.rollback_digest),
    after_hashes: Object.assign({}, ...applyResults.map((applyResult) => applyResult.after_hashes || {})),
    merge: input.merge || null,
    verification: input.verification || applyResults.map((applyResult) => applyResult.verification?.status).filter(Boolean),
    parallel_batches: input.merge?.parallel_batches || [],
    serial_conflicts: input.merge?.serial_conflicts || [],
    wall_clock_parallel_evidence: input.merge?.wall_clock_parallel_evidence || [],
    blockers
  }
}

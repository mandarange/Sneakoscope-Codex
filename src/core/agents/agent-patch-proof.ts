import { nowIso } from '../fsx.js'

export const AGENT_PATCH_PROOF_SCHEMA = 'sks.agent-patch-proof.v1'

export function buildAgentPatchProof(input: {
  queue?: any
  merge?: any
  applyResults?: any[]
  verification?: string[]
  parallelWritePolicy?: any
  transactionJournal?: any
  conflictRebase?: any
  verificationRollbackDag?: any
  fileOwnershipPlan?: any
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
  const verificationBlockers = applyResults.flatMap((applyResult, index) => {
    const changed = Array.isArray(applyResult?.changed_files) && applyResult.changed_files.length > 0
    return applyResult?.ok && changed && !applyResult.verification?.status ? [`missing_verification:${index}`] : []
  })
  const strictWiring = buildStrictWiring(queueEntries, applyResults, input.verificationRollbackDag, input.fileOwnershipPlan)
  const journalBlockers = applyResults.length > 0
    ? input.transactionJournal
      ? input.transactionJournal.ok === true ? [] : (input.transactionJournal.blockers || ['transaction_journal_not_ok'])
      : ['transaction_journal_missing']
    : []
  const rebaseBlockers = input.conflictRebase && input.conflictRebase.ok === false
    ? (input.conflictRebase.blockers || ['conflict_rebase_not_ok'])
    : []
  const hasParallelGroup = Array.isArray(input.merge?.parallel_apply_groups)
    ? input.merge.parallel_apply_groups.some((group: any) => Array.isArray(group.entry_ids) && group.entry_ids.length > 1)
    : false
  const parallelGroupBlockers = input.parallelWritePolicy?.write_mode === 'parallel'
    && queueEntries.length > 1
    && input.merge?.ok !== false
    && !hasParallelGroup
    ? ['parallel_write_without_parallel_apply_group']
    : []
  const blockers = [
    ...(input.merge && input.merge.ok === false ? ['merge_not_ok'] : []),
    ...(input.merge?.blockers || []),
    ...queueBlockers,
    ...rollbackBlockers,
    ...verificationBlockers,
    ...strictWiring.blockers,
    ...journalBlockers,
    ...rebaseBlockers,
    ...parallelGroupBlockers,
    ...applyResults.flatMap((applyResult) => applyResult.ok ? [] : (applyResult.violations || ['patch_apply_failed']))
  ].map(String)
  const changedFilesByAgent = changedFilesGroupedByAgent(applyResults)
  const rollbackReady = applyResults.length === 0 ? true : applyResults.every((applyResult) => !Array.isArray(applyResult.changed_files) || applyResult.changed_files.length === 0 || applyResult.rollback_digest)
  return {
    schema: AGENT_PATCH_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    queued_count: queuedCount,
    queue_event_count: input.queue?.events?.length || 0,
    patch_queue_ok: queuedCount === 0 && queueBlockers.length === 0,
    patch_apply_ok: applyResults.every((applyResult) => applyResult.ok !== false),
    patch_verification_ok: verificationBlockers.length === 0,
    patch_rollback_ok: rollbackBlockers.length === 0,
    transaction_journal_ok: journalBlockers.length === 0,
    conflict_rebase_ok: rebaseBlockers.length === 0,
    strategy_to_patch_ok: strictWiring.strategy_to_patch_ok,
    micro_win_to_patch_mapping: strictWiring.micro_win_to_patch_mapping,
    verification_node_coverage: strictWiring.verification_node_coverage,
    rollback_node_coverage: strictWiring.rollback_node_coverage,
    parallel_patch_apply_verified: hasParallelGroup,
    patch_conflict_count: Number(input.merge?.conflicts?.length || 0),
    serial_bottleneck_count: Number(input.merge?.serial_conflicts?.length || 0),
    changed_files_by_agent: changedFilesByAgent,
    lease_compliance_by_patch: (input.queue?.ownership_ledger || []).map((row: any) => ({
      entry_id: row.entry_id,
      lease_id: row.lease_id,
      ok: Boolean(row.lease_id) && Array.isArray(row.write_paths),
      write_paths: row.write_paths || []
    })),
    rollback_digest_count: applyResults.map((applyResult) => applyResult.rollback_digest).filter(Boolean).length,
    ownership_ledger: input.queue?.ownership_ledger || [],
    changed_files: [...new Set(applyResults.flatMap((applyResult) => applyResult.changed_files || []))],
    rollback_digests: applyResults.map((applyResult) => applyResult.rollback_digest).filter(Boolean),
    rollback_ready: rollbackReady,
    after_hashes: Object.assign({}, ...applyResults.map((applyResult) => applyResult.after_hashes || {})),
    merge: input.merge || null,
    verification: input.verification || applyResults.map((applyResult) => applyResult.verification?.status).filter(Boolean),
    transaction_journal: input.transactionJournal || null,
    conflict_rebase: input.conflictRebase || null,
    parallel_batches: input.merge?.parallel_batches || [],
    serial_conflicts: input.merge?.serial_conflicts || [],
    wall_clock_parallel_evidence: input.merge?.wall_clock_parallel_evidence || [],
    blockers
  }
}

function buildStrictWiring(queueEntries: any[], applyResults: any[], verificationRollbackDag?: any, fileOwnershipPlan?: any) {
  const entriesWithEnvelope = queueEntries.filter((entry: any) => entry?.envelope)
  const blockers: string[] = []
  const dagNodes = new Map<string, any>((verificationRollbackDag?.nodes || []).map((node: any) => [String(node.id || ''), node]))
  const owners = Array.isArray(fileOwnershipPlan?.owners) ? fileOwnershipPlan.owners : []
  const microWinMap: Record<string, string | null> = {}
  const verificationCoverage: Record<string, string | null> = {}
  const rollbackCoverage: Record<string, string | null> = {}
  for (const entry of entriesWithEnvelope) {
    const id = String(entry.id || 'unknown')
    const lease = entry.envelope?.lease_proof || {}
    const strategyRef = lease.strategy_task_id || lease.micro_win_id || entry.envelope?.task_slice_id
    const verificationNode = lease.verification_node_id || entry.envelope?.verification_hint?.node_id
    const rollbackNode = lease.rollback_node_id || entry.envelope?.rollback_hint?.node_id
    microWinMap[id] = lease.micro_win_id || entry.envelope?.task_slice_id || null
    verificationCoverage[id] = verificationNode || null
    rollbackCoverage[id] = rollbackNode || null
    if (!strategyRef) blockers.push(`strategy_reference_missing:${id}`)
    if (!verificationNode) blockers.push(`verification_node_missing:${id}`)
    if (!rollbackNode) blockers.push(`rollback_node_missing:${id}`)
    if (dagNodes.size > 0 && verificationNode && dagNodes.get(String(verificationNode))?.kind !== 'verification') blockers.push(`verification_node_not_in_dag:${id}:${verificationNode}`)
    if (dagNodes.size > 0 && rollbackNode && dagNodes.get(String(rollbackNode))?.kind !== 'rollback') blockers.push(`rollback_node_not_in_dag:${id}:${rollbackNode}`)
    if (!entry.lease_id && !entry.envelope?.lease_id && !lease.lease_id) blockers.push(`lease_id_missing:${id}`)
    if (!lease.owner_agent) blockers.push(`file_ownership_owner_missing:${id}`)
    if (owners.length > 0) {
      for (const file of entry.write_paths || []) {
        const owner = owners.find((row: any) => row.access === 'write' && normalizeProofPath(row.path) === normalizeProofPath(file))
        if (!owner) blockers.push(`file_ownership_path_missing:${id}:${file}`)
        else if (owner.owner_agent && lease.owner_agent && owner.owner_agent !== lease.owner_agent) blockers.push(`file_ownership_owner_mismatch:${id}:${file}`)
      }
    }
  }
  const applyByEntry = new Set(applyResults.map((result) => String(result?.entry_id || '')).filter(Boolean))
  for (const entry of entriesWithEnvelope) {
    if ((entry.status === 'applied' || entry.status === 'verified') && !applyByEntry.has(String(entry.id))) {
      blockers.push(`apply_result_missing_for_entry:${entry.id}`)
    }
  }
  return {
    strategy_to_patch_ok: blockers.length === 0,
    micro_win_to_patch_mapping: microWinMap,
    verification_node_coverage: verificationCoverage,
    rollback_node_coverage: rollbackCoverage,
    blockers
  }
}

function normalizeProofPath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '').split('/').filter((part) => part && part !== '.').join('/')
}

function changedFilesGroupedByAgent(applyResults: any[]) {
  const grouped = new Map<string, Set<string>>()
  for (const result of applyResults) {
    const agent = String(result?.agent_id || 'unknown')
    if (!grouped.has(agent)) grouped.set(agent, new Set())
    for (const file of result?.changed_files || []) grouped.get(agent)?.add(String(file))
  }
  return Object.fromEntries([...grouped.entries()].map(([agent, files]) => [agent, [...files].sort()]))
}

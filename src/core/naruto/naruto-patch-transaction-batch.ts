import type { AgentPatchEnvelope } from '../agents/agent-patch-schema.js'

export interface NarutoPatchBatch {
  batch_id: string
  envelope_ids: string[]
  write_paths: string[]
  parallel_apply_allowed: boolean
}

export interface NarutoPatchBatchPlan {
  schema: 'sks.naruto-patch-transaction-batch.v1'
  batches: NarutoPatchBatch[]
  conflicts: Array<{ envelope_id: string; conflicts_with: string[]; write_paths: string[] }>
}

export function planNarutoPatchTransactionBatches(envelopes: AgentPatchEnvelope[]): NarutoPatchBatchPlan {
  const batches: NarutoPatchBatch[] = []
  const conflicts: NarutoPatchBatchPlan['conflicts'] = []
  for (const envelope of envelopes) {
    const envelopeId = envelopeIdFor(envelope)
    const paths = envelope.operations.map((operation) => operation.path)
    let placed = false
    for (const batch of batches) {
      const overlaps = paths.filter((file) => batch.write_paths.includes(file))
      if (overlaps.length) continue
      batch.envelope_ids.push(envelopeId)
      batch.write_paths.push(...paths)
      batch.write_paths = [...new Set(batch.write_paths)]
      placed = true
      break
    }
    if (!placed) {
      const previousConflicts = envelopes
        .filter((candidate) => envelopeIdFor(candidate) !== envelopeId)
        .filter((candidate) => candidate.operations.some((operation) => paths.includes(operation.path)))
        .map(envelopeIdFor)
      if (previousConflicts.length) conflicts.push({ envelope_id: envelopeId, conflicts_with: previousConflicts, write_paths: paths })
      batches.push({
        batch_id: `NPB-${String(batches.length + 1).padStart(4, '0')}`,
        envelope_ids: [envelopeId],
        write_paths: [...new Set(paths)],
        parallel_apply_allowed: true
      })
    }
  }
  return {
    schema: 'sks.naruto-patch-transaction-batch.v1',
    batches,
    conflicts
  }
}

export function envelopeIdFor(envelope: AgentPatchEnvelope): string {
  return `${envelope.agent_id}:${envelope.session_id}:${envelope.task_slice_id || envelope.generation_index}`
}


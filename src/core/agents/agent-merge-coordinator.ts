import type { AgentPatchEnvelope } from './agent-patch-schema.js'

export const AGENT_MERGE_COORDINATOR_SCHEMA = 'sks.agent-merge-coordinator.v1'

export function coordinateAgentPatchMerge(envelopes: AgentPatchEnvelope[]) {
  const writers = new Map<string, string[]>()
  for (const envelope of envelopes) {
    for (const operation of envelope.operations || []) {
      const key = normalizePatchPath(operation.path || '')
      if (!writers.has(key)) writers.set(key, [])
      writers.get(key)?.push(envelope.agent_id)
    }
  }
  const conflicts = mergeConflicts(writers)
  const serialConflictAgents = new Set(conflicts.flatMap((conflict) => conflict.agents))
  const parallelBatch = envelopes.filter((envelope) => !serialConflictAgents.has(envelope.agent_id)).map((envelope) => envelope.agent_id)
  return {
    schema: AGENT_MERGE_COORDINATOR_SCHEMA,
    ok: conflicts.length === 0,
    merge_order: envelopes.map((envelope) => envelope.agent_id),
    touched_files: [...writers.keys()].sort(),
    conflicts,
    parallel_batches: parallelBatch.length ? [{ batch_id: 'batch-001', agents: parallelBatch }] : [],
    serial_conflicts: conflicts,
    wall_clock_parallel_evidence: parallelBatch.length ? [`batch-001:${parallelBatch.length}_agents_can_apply_without_overlapping_paths`] : [],
    blockers: conflicts.map((conflict) => `parallel_write_conflict:${conflict.file}`)
  }
}

function mergeConflicts(writers: Map<string, string[]>): Array<{ file: string; agents: string[] }> {
  const rows = [...writers.entries()].sort(([left], [right]) => left.localeCompare(right))
  const conflicts: Array<{ file: string; agents: string[] }> = []
  for (let i = 0; i < rows.length; i += 1) {
    const [leftFile, leftAgents] = rows[i]!
    for (let j = i; j < rows.length; j += 1) {
      const [rightFile, rightAgents] = rows[j]!
      if (!pathsOverlap(leftFile, rightFile)) continue
      const agents = [...new Set([...leftAgents, ...rightAgents])]
      if (agents.length <= 1) continue
      conflicts.push({ file: leftFile === rightFile ? leftFile : `${leftFile}<->${rightFile}`, agents })
    }
  }
  return conflicts
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

function normalizePatchPath(value: string): string {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '')
  const compact = normalized.split('/').filter((part) => part && part !== '.').join('/')
  return compact || '.'
}

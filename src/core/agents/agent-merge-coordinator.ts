import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'
import type { AgentPatchEnvelope } from './agent-patch-schema.js'
import type { AgentPatchQueueEntry } from './agent-patch-queue.js'

export const AGENT_MERGE_COORDINATOR_SCHEMA = 'sks.agent-merge-coordinator.v1'

export type AgentPatchMergeInput = AgentPatchEnvelope | AgentPatchQueueEntry

export interface AgentPatchMergeCoordinatorOptions {
  artifactsDir?: string
}

interface MergeItem {
  entry_id: string
  agent_id: string
  lease_id: string | null
  status?: string
  envelope: AgentPatchEnvelope
}

export function coordinateAgentPatchMerge(inputs: AgentPatchMergeInput[], opts: AgentPatchMergeCoordinatorOptions = {}) {
  const items = normalizeInputs(inputs)
  const writers = new Map<string, MergeItem[]>()
  const blockedConflicts: Array<{ type: string; file: string; entries: string[]; agents: string[]; reason: string }> = []
  for (const item of items) {
    if (item.status && item.status !== 'pending') {
      blockedConflicts.push({ type: 'status', file: '.', entries: [item.entry_id], agents: [item.agent_id], reason: `entry_not_pending:${item.status}` })
    }
    for (const operation of item.envelope.operations || []) {
      const key = normalizePatchPath(operation.path || '')
      if (!writers.has(key)) writers.set(key, [])
      writers.get(key)?.push(item)
      if (protectedPath(key)) {
        blockedConflicts.push({ type: 'protected_path', file: key, entries: [item.entry_id], agents: [item.agent_id], reason: `protected_path:${key}` })
      }
      if (!pathAllowedByLease(key, item.envelope)) {
        blockedConflicts.push({ type: 'lease', file: key, entries: [item.entry_id], agents: [item.agent_id], reason: `lease_path_not_allowed:${key}` })
      }
    }
  }
  for (const conflict of domainConflicts(items)) blockedConflicts.push(conflict)
  const conflicts = mergeConflicts(writers)
  const allBlockedConflicts = [...blockedConflicts, ...conflicts]
  const serialConflictEntries = new Set(allBlockedConflicts.flatMap((conflict) => conflict.entries))
  const parallelEntries = items.filter((item) => !serialConflictEntries.has(item.entry_id))
  const parallelApplyGroups = parallelEntries.length ? [{
    group_id: 'parallel-001',
    entry_ids: parallelEntries.map((item) => item.entry_id),
    agents: parallelEntries.map((item) => item.agent_id),
    expected_speedup: parallelEntries.length
  }] : []
  const serialMergeGroups = allBlockedConflicts.map((conflict, index) => ({
    group_id: `serial-${String(index + 1).padStart(3, '0')}`,
    entry_ids: conflict.entries,
    agents: conflict.agents,
    reason: conflict.reason,
    file: conflict.file
  }))
  const result = {
    schema: AGENT_MERGE_COORDINATOR_SCHEMA,
    ok: allBlockedConflicts.length === 0,
    merge_order: items.map((item) => item.agent_id),
    apply_order: [...parallelApplyGroups.map((group) => group.group_id), ...serialMergeGroups.map((group) => group.group_id)],
    touched_files: [...writers.keys()].sort(),
    conflicts: allBlockedConflicts,
    conflict_graph: {
      nodes: items.map((item) => ({ entry_id: item.entry_id, agent_id: item.agent_id, lease_id: item.lease_id })),
      edges: allBlockedConflicts.map((conflict) => ({ file: conflict.file, entries: conflict.entries, reason: conflict.reason }))
    },
    parallel_apply_groups: parallelApplyGroups,
    serial_merge_groups: serialMergeGroups,
    blocked_conflicts: allBlockedConflicts,
    parallel_batches: parallelApplyGroups.map((group) => ({ batch_id: group.group_id, agents: group.agents })),
    serial_conflicts: allBlockedConflicts,
    apply_plan: {
      parallel_apply_groups: parallelApplyGroups,
      serial_merge_groups: serialMergeGroups,
      retry_policy: 'rebase_stale_context_then_requeue'
    },
    wall_clock_parallel_evidence: parallelApplyGroups.length ? [`parallel-001:${parallelEntries.length}_entries_can_apply_without_overlapping_paths`] : [],
    blockers: allBlockedConflicts.map((conflict) => conflict.reason)
  }
  if (opts.artifactsDir) void writeAgentMergeCoordinatorArtifacts(opts.artifactsDir, result)
  return result
}

export async function writeAgentMergeCoordinatorArtifacts(artifactDir: string, report: ReturnType<typeof coordinateAgentPatchMerge>): Promise<void> {
  await writeJsonAtomic(path.join(artifactDir, 'agent-merge-coordinator-report.json'), report)
  await writeJsonAtomic(path.join(artifactDir, 'agent-patch-conflict-graph.json'), report.conflict_graph)
  await writeJsonAtomic(path.join(artifactDir, 'agent-patch-apply-plan.json'), report.apply_plan)
  await writeJsonAtomic(path.join(artifactDir, 'agent-patch-apply-order.json'), {
    schema: 'sks.agent-patch-apply-order.v1',
    order: report.apply_order
  })
}

function mergeConflicts(writers: Map<string, MergeItem[]>): Array<{ type: string; file: string; entries: string[]; agents: string[]; reason: string }> {
  const rows = [...writers.entries()].sort(([left], [right]) => left.localeCompare(right))
  const conflicts: Array<{ type: string; file: string; entries: string[]; agents: string[]; reason: string }> = []
  for (let i = 0; i < rows.length; i += 1) {
    const [leftFile, leftItems] = rows[i]!
    for (let j = i; j < rows.length; j += 1) {
      const [rightFile, rightItems] = rows[j]!
      if (!pathsOverlap(leftFile, rightFile)) continue
      const entries = [...new Set([...leftItems, ...rightItems].map((item) => item.entry_id))]
      if (entries.length <= 1) continue
      const agents = [...new Set([...leftItems, ...rightItems].map((item) => item.agent_id))]
      const file = leftFile === rightFile ? leftFile : `${leftFile}<->${rightFile}`
      const reason = leftFile === rightFile ? `parallel_write_conflict:${file}` : `subtree_write_conflict:${file}`
      conflicts.push({ type: leftFile === rightFile ? 'path' : 'subtree', file, entries, agents, reason })
    }
  }
  return conflicts
}

function domainConflicts(items: MergeItem[]): Array<{ type: string; file: string; entries: string[]; agents: string[]; reason: string }> {
  const byPrediction = new Map<string, MergeItem[]>()
  for (const item of items) {
    const prediction = item.envelope.lease_proof?.conflict_prediction_id
    if (!prediction) continue
    const key = String(prediction)
    if (!byPrediction.has(key)) byPrediction.set(key, [])
    byPrediction.get(key)?.push(item)
  }
  return [...byPrediction.entries()].flatMap(([prediction, rows]) => {
    const entries = [...new Set(rows.map((item) => item.entry_id))]
    if (entries.length <= 1) return []
    return [{
      type: 'domain',
      file: prediction,
      entries,
      agents: [...new Set(rows.map((item) => item.agent_id))],
      reason: `domain_conflict:${prediction}`
    }]
  })
}

function normalizeInputs(inputs: AgentPatchMergeInput[]): MergeItem[] {
  return inputs.map((input, index) => {
    if ('envelope' in input) {
      return {
        entry_id: input.id,
        agent_id: input.agent_id,
        lease_id: input.lease_id || input.envelope.lease_id || input.envelope.lease_proof?.lease_id || null,
        status: input.status,
        envelope: input.envelope
      }
    }
    return {
      entry_id: `${input.agent_id}-${String(index + 1).padStart(4, '0')}`,
      agent_id: input.agent_id,
      lease_id: input.lease_id || input.lease_proof?.lease_id || null,
      envelope: input
    }
  })
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

function normalizePatchPath(value: string): string {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '')
  const compact = normalized.split('/').filter((part) => part && part !== '.').join('/')
  return compact || '.'
}

const PROTECTED_PATH_RE = /^(?:\.codex\/|\.agents\/skills\/|\.codex\/agents\/|AGENTS\.md$|node_modules\/sneakoscope\/|\.sneakoscope\/.*policy.*\.json$)/

function protectedPath(value: string): boolean {
  return PROTECTED_PATH_RE.test(value)
}

function pathAllowedByLease(operationPath: string, envelope: AgentPatchEnvelope): boolean {
  const allowedPaths = envelope.lease_proof?.allowed_paths
  if (!allowedPaths?.length) return true
  const rel = normalizePatchPath(operationPath)
  return allowedPaths.map(normalizePatchPath).some((allowed) => rel === allowed || rel.startsWith(`${allowed}/`))
}

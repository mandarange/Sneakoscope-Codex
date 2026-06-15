import { mapWorkKindToNarutoRole } from './naruto-role-policy.js'
import {
  isNarutoWriteKind,
  normalizeNarutoPath,
  type NarutoLeaseRequirement,
  type NarutoWorktreePolicy,
  type NarutoWorkGraph,
  type NarutoWorkItem,
  type NarutoWorkKind,
  type NarutoWorkWave
} from './naruto-work-item.js'
import type { NarutoTaskHints } from './naruto-task-hints.js'

export interface NarutoAllocationAssignmentInput {
  task_id?: string
  id?: string
  owner: string
  allocation_reason?: string
  allocation_score?: number
  hints?: NarutoTaskHints | null
  allocation_hints?: NarutoTaskHints | null
}

export interface BuildNarutoWorkGraphInput {
  prompt?: string
  requestedClones?: number
  totalWorkItems?: number
  honorExplicitTotalWorkItems?: boolean
  readonly?: boolean
  writeCapable?: boolean
  targetPaths?: string[]
  readonlyPaths?: string[]
  leaseBasePath?: string
  maxActiveWorkers?: number
  worktreePolicy?: NarutoWorktreePolicy
  allocationAssignments?: NarutoAllocationAssignmentInput[]
}

const WRITE_CAPABLE_KIND_CYCLE: NarutoWorkKind[] = [
  'implementation',
  'code_modification',
  'test_generation',
  'verification',
  'research',
  'documentation',
  'refactor',
  'test_execution',
  'conflict_resolution',
  'patch_rebase',
  'rollback_preparation',
  'integration_support',
  'final_review_input_pack'
]

const READONLY_KIND_CYCLE: NarutoWorkKind[] = [
  'verification',
  'research',
  'test_execution',
  'ux_review',
  'ppt_review',
  'image_review',
  'final_review_input_pack'
]

export function buildNarutoWorkGraph(input: BuildNarutoWorkGraphInput = {}): NarutoWorkGraph {
  const requestedClones = normalizePositiveInt(input.requestedClones, 12)
  const readonly = input.readonly === true
  const writeCapable = input.writeCapable !== false && !readonly
  const minimumFanout = writeCapable ? requestedClones * 2 : requestedClones
  const requestedWorkItems = normalizePositiveInt(input.totalWorkItems, minimumFanout)
  const totalWorkItems = input.honorExplicitTotalWorkItems === true
    ? Math.max(requestedClones, requestedWorkItems)
    : Math.max(minimumFanout, requestedWorkItems)
  const kindCycle = writeCapable ? WRITE_CAPABLE_KIND_CYCLE : READONLY_KIND_CYCLE
  const basePath = normalizeNarutoPath(input.leaseBasePath || '.sneakoscope/naruto/patch-envelopes')
  const targetPaths = normalizePaths(input.targetPaths || [])
  const readonlyPaths = normalizePaths(input.readonlyPaths || [])
  const worktreePolicy = input.worktreePolicy || {
    mode: 'patch-envelope-only' as const,
    required: false,
    main_repo_root: null,
    worktree_root: null,
    fallback_reason: writeCapable ? 'git_capability_not_evaluated' : 'readonly_or_write_disabled'
  }
  const workItems: NarutoWorkItem[] = []
  const assignmentById = new Map<string, NarutoAllocationAssignmentInput>()
  for (const row of input.allocationAssignments || []) {
    const id = String(row.task_id || row.id || '')
    if (id) assignmentById.set(id, row)
  }

  for (let index = 0; index < totalWorkItems; index += 1) {
    const id = `NW-${String(index + 1).padStart(6, '0')}`
    const kind = kindCycle[index % kindCycle.length] || 'verification'
    const kindWrites = writeCapable && isNarutoWriteKind(kind)
    const selectedTarget = targetPaths.length ? targetPaths[index % targetPaths.length] || targetPaths[0] || '' : `${basePath}/${id}.json`
    const writePaths = kindWrites ? [selectedTarget].filter(Boolean) : []
    const readPaths = readonlyPaths.length ? readonlyPaths : targetPaths.filter((item) => !writePaths.includes(item))
    const leaseRequirements: NarutoLeaseRequirement[] = [
      ...writePaths.map((file) => ({ path: file, kind: 'write' as const })),
      ...readPaths.map((file) => ({ path: file, kind: 'read' as const }))
    ]
    const assignment = assignmentById.get(id)
    const allocationHints = assignment?.allocation_hints || assignment?.hints || null
    workItems.push({
      id,
      kind,
      title: titleForKind(kind, id),
      target_paths: [...new Set([...(writePaths.length ? writePaths : [selectedTarget].filter(Boolean)), ...readPaths])],
      readonly_paths: readPaths,
      write_paths: writePaths,
      required_role: mapWorkKindToNarutoRole(kind),
      write_allowed: writePaths.length > 0,
      verification_required: kind !== 'research' && kind !== 'final_review_input_pack',
      dependencies: dependenciesForKind(kind, workItems),
      can_run_in_parallel_with: [],
      conflicts_with: [],
      estimated_cost: estimateCost(kind),
      lease_requirements: leaseRequirements,
      acceptance: {
        requires_patch_envelope: writePaths.length > 0,
        requires_verification: kind !== 'research' && kind !== 'final_review_input_pack',
        requires_gpt_final: writePaths.length > 0 || kind === 'final_review_input_pack'
      },
      owner: assignment?.owner ?? null,
      allocation_reason: assignment?.allocation_reason ?? null,
      allocation_score: assignment?.allocation_score ?? null,
      allocation_hints: allocationHints,
      lane: assignment?.owner ?? null,
      ...(writePaths.length > 0 ? {
        worktree: {
          mode: worktreePolicy.mode,
          required: worktreePolicy.required,
          allocation_required: worktreePolicy.mode === 'git-worktree'
        }
      } : {})
    })
  }

  const activeWaves = planNarutoWorkWaves(workItems, Math.max(1, normalizePositiveInt(input.maxActiveWorkers, requestedClones)))
  annotateParallelCompatibility(workItems, activeWaves)
  const mixedWorkKinds = [...new Set(workItems.map((item) => item.kind))]
  const writeAllowedCount = workItems.filter((item) => item.write_allowed).length
  const blockers = [
    ...(mixedWorkKinds.length < 2 ? ['naruto_work_graph_not_mixed'] : []),
    ...(!readonly && writeAllowedCount === 0 ? ['naruto_write_capable_graph_missing_write_items'] : []),
    ...(workItems.length < requestedClones ? ['naruto_work_graph_below_requested_clones'] : []),
    ...activeWaves.flatMap((wave) => wave.conflict_count > 0 ? [`naruto_wave_write_conflict:${wave.wave_id}`] : [])
  ]
  return {
    schema: 'sks.naruto-work-graph.v1',
    route: '$Naruto',
    requested_clones: requestedClones,
    total_work_items: workItems.length,
    readonly,
    write_capable: writeCapable,
    work_items: workItems,
    active_waves: activeWaves,
    mixed_work_kinds: mixedWorkKinds,
    write_allowed_count: writeAllowedCount,
    worktree_policy: worktreePolicy,
    ok: blockers.length === 0,
    blockers
  }
}

export function validateNarutoWorkGraph(graph: NarutoWorkGraph): { ok: boolean; blockers: string[] } {
  const ids = new Set<string>()
  const blockers = [...graph.blockers]
  for (const item of graph.work_items) {
    if (ids.has(item.id)) blockers.push(`duplicate_work_item:${item.id}`)
    ids.add(item.id)
    for (const dep of item.dependencies) {
      if (!ids.has(dep) && !graph.work_items.some((candidate) => candidate.id === dep)) blockers.push(`missing_dependency:${item.id}:${dep}`)
    }
    if (item.write_allowed && item.acceptance.requires_patch_envelope !== true) blockers.push(`write_item_missing_patch_envelope_acceptance:${item.id}`)
  }
  if (graph.total_work_items !== graph.work_items.length) blockers.push('naruto_work_graph_count_mismatch')
  if (!graph.readonly && graph.write_allowed_count === 0) blockers.push('naruto_write_capable_graph_missing_write_items')
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] }
}

export function planNarutoWorkWaves(items: NarutoWorkItem[], maxActiveWorkers: number): NarutoWorkWave[] {
  const pending = [...items]
  const waves: NarutoWorkWave[] = []
  while (pending.length) {
    const waveItems: NarutoWorkItem[] = []
    const writePaths = new Set<string>()
    for (let index = 0; index < pending.length && waveItems.length < maxActiveWorkers;) {
      const item = pending[index]
      if (!item) {
        index += 1
        continue
      }
      const conflicts = item.write_paths.some((file) => writePaths.has(file))
      if (conflicts) {
        index += 1
        continue
      }
      waveItems.push(item)
      for (const file of item.write_paths) writePaths.add(file)
      pending.splice(index, 1)
    }
    if (!waveItems.length) {
      const item = pending.shift()
      if (item) waveItems.push(item)
    }
    const paths = waveItems.flatMap((item) => item.write_paths)
    waves.push({
      wave_id: `NWAVE-${String(waves.length + 1).padStart(4, '0')}`,
      work_item_ids: waveItems.map((item) => item.id),
      write_paths: [...new Set(paths)],
      conflict_count: paths.length - new Set(paths).size
    })
  }
  return waves
}

function annotateParallelCompatibility(items: NarutoWorkItem[], waves: NarutoWorkWave[]) {
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const wave of waves) {
    for (const id of wave.work_item_ids) {
      const item = byId.get(id)
      if (!item) continue
      item.can_run_in_parallel_with = wave.work_item_ids.filter((other) => other !== id)
      item.conflicts_with = items
        .filter((other) => other.id !== id && other.write_paths.some((file) => item.write_paths.includes(file)))
        .map((other) => other.id)
    }
  }
}

function dependenciesForKind(kind: NarutoWorkKind, previous: NarutoWorkItem[]): string[] {
  if (kind === 'verification' || kind === 'test_execution') {
    const candidate = [...previous].reverse().find((item) => item.write_allowed)
    return candidate ? [candidate.id] : []
  }
  if (kind === 'final_review_input_pack') {
    return previous.slice(-3).map((item) => item.id)
  }
  return []
}

function estimateCost(kind: NarutoWorkKind) {
  const heavy = kind === 'implementation' || kind === 'code_modification' || kind === 'refactor' || kind === 'conflict_resolution'
  return {
    tokens: heavy ? 8000 : 3000,
    latency_ms: heavy ? 90000 : 30000,
    cpu_weight: kind === 'test_execution' || kind === 'verification' ? 2 : 1,
    memory_mb: heavy ? 512 : 256,
    gpu_weight: 0
  }
}

function titleForKind(kind: NarutoWorkKind, id: string): string {
  return `${id} ${kind.replace(/_/g, ' ')}`
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return Math.max(1, Math.floor(fallback))
  return Math.floor(parsed)
}

function normalizePaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeNarutoPath).filter(Boolean))]
}

import { createNarutoGeneration, completeNarutoGeneration, type NarutoGeneration } from './naruto-generation-scheduler.js'
import type { NarutoConcurrencyGovernorDecision } from './naruto-concurrency-governor.js'
import type { NarutoWorkGraph, NarutoWorkItem } from './naruto-work-item.js'

export interface NarutoActivePoolReport {
  schema: 'sks.naruto-active-pool.v1'
  ok: boolean
  safe_active_workers: number
  total_work_items: number
  completed_count: number
  failed_count: number
  refill_events: number
  max_observed_active_workers: number
  duplicate_execution_count: number
  conflict_items_enqueued: number
  max_observed_write_lease_conflicts: number
  timeline: Array<{ tick: number; active: number; pending: number; completed: number; event: string }>
  blockers: string[]
}

export interface NarutoWorktreeActivePoolReport extends NarutoActivePoolReport {
  worktree_mode: 'git-worktree' | 'patch-envelope-only'
  worktree_allocation_required_count: number
  worktree_allocations: Array<{
    work_item_id: string
    mode: 'git-worktree' | 'patch-envelope-only'
    allocation_status: 'planned' | 'allocated' | 'skipped'
    worktree_path?: string
    branch?: string
    blockers: string[]
  }>
}

export async function runNarutoActivePool(input: {
  graph: NarutoWorkGraph
  governor: NarutoConcurrencyGovernorDecision
  failWorkItemIds?: string[]
  retryLimit?: number
  allocateWorktree?: (item: NarutoWorkItem) => Promise<{ ok: boolean; worktree_path?: string; branch?: string; blockers?: string[] }>
}): Promise<NarutoWorktreeActivePoolReport> {
  const base = simulateNarutoActivePool(input)
  const allocations: NarutoWorktreeActivePoolReport['worktree_allocations'] = []
  for (const item of input.graph.work_items) {
    if (!item.write_allowed) continue
    const mode = item.worktree?.mode || input.graph.worktree_policy.mode
    if (mode !== 'git-worktree') {
      allocations.push({ work_item_id: item.id, mode, allocation_status: 'skipped', blockers: [] })
      continue
    }
    if (!input.allocateWorktree) {
      allocations.push({ work_item_id: item.id, mode, allocation_status: 'planned', blockers: [] })
      continue
    }
    const allocated = await input.allocateWorktree(item)
    allocations.push({
      work_item_id: item.id,
      mode,
      allocation_status: allocated.ok ? 'allocated' : 'planned',
      ...(allocated.worktree_path ? { worktree_path: allocated.worktree_path } : {}),
      ...(allocated.branch ? { branch: allocated.branch } : {}),
      blockers: allocated.blockers || []
    })
  }
  const allocationBlockers = allocations.flatMap((row) => row.blockers)
  return {
    ...base,
    ok: base.ok && allocationBlockers.length === 0,
    worktree_mode: input.graph.worktree_policy.mode,
    worktree_allocation_required_count: allocations.filter((row) => row.mode === 'git-worktree').length,
    worktree_allocations: allocations,
    blockers: [...base.blockers, ...allocationBlockers]
  }
}

export function simulateNarutoActivePool(input: {
  graph: NarutoWorkGraph
  governor: NarutoConcurrencyGovernorDecision
  failWorkItemIds?: string[]
  retryLimit?: number
}): NarutoActivePoolReport {
  const safeActiveWorkers = Math.max(1, input.governor.safe_active_workers)
  const retryLimit = Math.max(0, Math.floor(Number(input.retryLimit ?? 1)))
  const failIds = new Set((input.failWorkItemIds || []).map(String))
  const pending = [...input.graph.work_items]
  const active = new Map<string, NarutoGeneration>()
  const completed = new Set<string>()
  const failed = new Set<string>()
  const executed = new Map<string, number>()
  const byId = new Map(input.graph.work_items.map((item) => [item.id, item]))
  const timeline: NarutoActivePoolReport['timeline'] = []
  let generationIndex = 1
  let tick = 0
  let refillEvents = 0
  let maxObserved = 0
  let maxObservedWriteLeaseConflicts = 0
  let conflictItemsEnqueued = 0

  while (pending.length || active.size) {
    let launched = 0
    for (;;) {
      if (active.size >= safeActiveWorkers) break
      const next = popRunnable(pending, completed, active, byId)
      if (!next) break
      const generation = createNarutoGeneration(next, generationIndex, tick)
      generationIndex += 1
      active.set(generation.generation_id, generation)
      executed.set(next.id, (executed.get(next.id) || 0) + 1)
      launched += 1
    }
    if (launched) refillEvents += launched
    maxObserved = Math.max(maxObserved, active.size)
    maxObservedWriteLeaseConflicts = Math.max(maxObservedWriteLeaseConflicts, countActiveWriteLeaseConflicts(active, byId))
    timeline.push({ tick, active: active.size, pending: pending.length, completed: completed.size, event: launched ? 'refill' : 'wait' })
    const done = [...active.values()].slice(0, Math.max(1, Math.ceil(active.size / 2)))
    if (!done.length && pending.length) break
    for (const generation of done) {
      active.delete(generation.generation_id)
      const shouldFail = failIds.has(generation.work_item_id) && (executed.get(generation.work_item_id) || 0) <= retryLimit
      completeNarutoGeneration(generation, tick + 1, shouldFail)
      if (shouldFail) {
        failed.add(generation.work_item_id)
        conflictItemsEnqueued += 1
        const followup = conflictResolutionFollowup(generation.work_item_id, input.graph.work_items.length + conflictItemsEnqueued)
        pending.push(followup)
        byId.set(followup.id, followup)
      } else {
        completed.add(generation.work_item_id)
      }
    }
    tick += 1
    if (tick > input.graph.work_items.length * 4 + 20) break
  }
  const duplicateExecutionCount = [...executed.values()].filter((count) => count > 1).length
  const blockers = [
    ...(pending.length ? ['naruto_active_pool_pending_not_drained'] : []),
    ...(active.size ? ['naruto_active_pool_active_not_drained'] : []),
    ...(maxObserved > safeActiveWorkers ? ['naruto_active_pool_exceeded_safe_workers'] : []),
    ...(maxObservedWriteLeaseConflicts > 0 ? ['naruto_active_pool_overlapping_write_leases'] : []),
    ...(duplicateExecutionCount > conflictItemsEnqueued ? ['naruto_active_pool_duplicate_execution_without_retry'] : [])
  ]
  return {
    schema: 'sks.naruto-active-pool.v1',
    ok: blockers.length === 0,
    safe_active_workers: safeActiveWorkers,
    total_work_items: input.graph.total_work_items,
    completed_count: completed.size,
    failed_count: failed.size,
    refill_events: refillEvents,
    max_observed_active_workers: maxObserved,
    duplicate_execution_count: duplicateExecutionCount,
    conflict_items_enqueued: conflictItemsEnqueued,
    max_observed_write_lease_conflicts: maxObservedWriteLeaseConflicts,
    timeline,
    blockers
  }
}

function popRunnable(pending: NarutoWorkItem[], completed: Set<string>, active: Map<string, NarutoGeneration>, byId: Map<string, NarutoWorkItem>): NarutoWorkItem | null {
  const activeWorkIds = new Set([...active.values()].map((item) => item.work_item_id))
  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index]
    if (!item) continue
    if (activeWorkIds.has(item.id)) continue
    if (!item.dependencies.every((dep) => completed.has(dep))) continue
    const writeConflict = [...active.values()].some((generation) => {
      const activeItem = byId.get(generation.work_item_id)
      return activeItem?.write_paths.some((file) => item.write_paths.includes(file))
    })
    if (writeConflict) continue
    pending.splice(index, 1)
    return item
  }
  return null
}

function countActiveWriteLeaseConflicts(active: Map<string, NarutoGeneration>, byId: Map<string, NarutoWorkItem>): number {
  const counts = new Map<string, number>()
  for (const generation of active.values()) {
    const item = byId.get(generation.work_item_id)
    for (const file of item?.write_paths || []) counts.set(file, (counts.get(file) || 0) + 1)
  }
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0)
}

function conflictResolutionFollowup(failedId: string, index: number): NarutoWorkItem {
  const id = `NW-CONFLICT-${String(index).padStart(4, '0')}`
  return {
    id,
    kind: 'conflict_resolution',
    title: `Resolve failed work item ${failedId}`,
    target_paths: [],
    readonly_paths: [],
    write_paths: [`.sneakoscope/naruto/conflicts/${id}.json`],
    required_role: 'conflict_resolver',
    write_allowed: true,
    verification_required: true,
    dependencies: [],
    can_run_in_parallel_with: [],
    conflicts_with: [],
    estimated_cost: { tokens: 4000, latency_ms: 45000, cpu_weight: 1, memory_mb: 256, gpu_weight: 0 },
    lease_requirements: [{ path: `.sneakoscope/naruto/conflicts/${id}.json`, kind: 'write' }],
    acceptance: { requires_patch_envelope: true, requires_verification: true, requires_gpt_final: true }
  }
}

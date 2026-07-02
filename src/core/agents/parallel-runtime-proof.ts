import path from 'node:path'
import { appendJsonlBounded, ensureDir, nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'

export const PARALLEL_RUNTIME_EVENT_SCHEMA = 'sks.parallel-runtime-event.v1'
export const PARALLEL_RUNTIME_PROOF_SCHEMA = 'sks.parallel-runtime-proof.v1'

export type ParallelRuntimeEventType =
  | 'batch_dispatch_started'
  | 'slot_reserved'
  | 'worker_launch_invoked'
  | 'worker_process_spawned'
  | 'zellij_pane_creation_lock_requested'
  | 'zellij_pane_creation_lock_acquired'
  | 'zellij_pane_creation_lock_released'
  | 'zellij_pane_created'
  | 'worker_heartbeat_seen'
  | 'model_call_started'
  | 'model_call_completed'
  | 'worktree_allocation_started'
  | 'worktree_allocation_completed'
  | 'worker_completed'
  | 'worker_failed'
  | 'batch_dispatch_completed'

export type ParallelRuntimePlacement = 'zellij-pane' | 'process' | 'headless' | 'headless_by_design_viewport_ui' | 'unknown'

export interface ParallelRuntimeEvent {
  schema: typeof PARALLEL_RUNTIME_EVENT_SCHEMA
  ts: string
  ms: number
  mission_id: string
  event_type: ParallelRuntimeEventType
  slot_id: string | null
  generation_index: number | null
  session_id: string | null
  pid: number | null
  backend: string
  placement: ParallelRuntimePlacement
  worktree_id?: string | null
  model_call_id?: string | null
  batch_id?: string | null
  meta?: Record<string, unknown>
}

export interface ParallelRuntimeProof {
  schema: typeof PARALLEL_RUNTIME_PROOF_SCHEMA
  mission_id: string
  generated_at: string
  proof_mode: 'production' | 'mock-process' | 'in-process-fixture'
  require_worker_pids: boolean
  allow_missing_pids: boolean
  requested_workers: number
  target_active_slots: number
  max_observed_active_workers: number
  max_observed_worker_processes: number
  unique_worker_pids: number
  unique_model_call_ids: number
  max_observed_model_calls: number
  launch_span_ms: number
  first_batch_launch_span_ms: number
  wall_ms: number
  sequential_estimate_ms: number
  speedup_ratio: number
  overlap_windows: Array<{
    start_ms: number
    end_ms: number
    active_workers: number
    active_model_calls: number
  }>
  visible_panes: number
  headless_workers: number
  utilization_proof_consistency: {
    ok: boolean
    scheduler_max_active: number
    proof_max_active: number
    wall_ms_delta: number
    scheduler_active_slot_time_ms: number
    proof_active_slot_time_ms: number
    active_slot_time_ms_delta: number
    scheduler_observation_delay_tolerance_ms: number
  }
  passed: boolean
  blockers: string[]
}

export function parallelRuntimeEventPath(root: string, missionId: string): string {
  return path.join(inferAgentsDir(root, missionId), 'parallel-runtime.events.jsonl')
}

export function parallelRuntimeProofPath(root: string, missionId: string): string {
  return path.join(inferAgentsDir(root, missionId), 'parallel-runtime-proof.json')
}

export async function appendParallelRuntimeEvent(
  root: string,
  missionId: string,
  event: Omit<Partial<ParallelRuntimeEvent>, 'schema' | 'ts' | 'ms' | 'mission_id'> & { event_type: ParallelRuntimeEventType }
): Promise<ParallelRuntimeEvent> {
  const row = normalizeParallelRuntimeEvent(missionId, event)
  const file = parallelRuntimeEventPath(root, missionId)
  await ensureDir(path.dirname(file))
  await appendJsonlBounded(file, row)
  return row
}

export async function buildParallelRuntimeProof(root: string, missionId: string, opts: {
  requestedWorkers?: number
  targetActiveSlots?: number
  visiblePanes?: number
  expectedWorkerRuntimeMs?: number
  minActiveWorkers?: number
  minSpeedupRatio?: number
  firstBatchLaunchSpanLimitMs?: number
  proofMode?: 'production' | 'mock-process' | 'in-process-fixture'
  requireWorkerPids?: boolean
  allowMissingPids?: boolean
} = {}): Promise<ParallelRuntimeProof> {
  const events = await readParallelRuntimeEvents(root, missionId)
  const sorted = events.sort((a, b) => a.ms - b.ms)
  const firstMs = sorted[0]?.ms || Date.now()
  const lastMs = sorted[sorted.length - 1]?.ms || firstMs
  const workerActive = new Set<string>()
  const processActive = new Set<string>()
  const modelActive = new Set<string>()
  const workerStarts = new Map<string, number>()
  const workerDurations: number[] = []
  const workerPids = new Set<number>()
  const modelIds = new Set<string>()
  const overlapWindows: ParallelRuntimeProof['overlap_windows'] = []
  let maxWorkers = 0
  let maxProcesses = 0
  let maxModels = 0
  let previousMs = firstMs
  let firstBatchLaunchSpanMs = 0
  const batchStart = new Map<string, number>()
  const batchCompleted = new Map<string, number>()

  for (const event of sorted) {
    if (event.ms > previousMs) {
      overlapWindows.push({
        start_ms: previousMs - firstMs,
        end_ms: event.ms - firstMs,
        active_workers: workerActive.size,
        active_model_calls: modelActive.size
      })
      previousMs = event.ms
    }
    const workerKey = event.session_id || event.slot_id || (event.pid == null ? '' : `pid:${event.pid}`)
    const processKey = event.pid == null ? workerKey : `pid:${event.pid}`
    if (event.event_type === 'batch_dispatch_started' && event.batch_id) batchStart.set(event.batch_id, event.ms)
    if (event.event_type === 'batch_dispatch_completed' && event.batch_id) {
      batchCompleted.set(event.batch_id, event.ms)
      const started = batchStart.get(event.batch_id)
      if (started != null && firstBatchLaunchSpanMs === 0) firstBatchLaunchSpanMs = Math.max(0, event.ms - started)
    }
    if (event.event_type === 'worker_launch_invoked' || event.event_type === 'worker_process_spawned') {
      if (workerKey) {
        workerActive.add(workerKey)
        if (!workerStarts.has(workerKey)) workerStarts.set(workerKey, event.ms)
      }
      if (event.event_type === 'worker_process_spawned' && processKey) processActive.add(processKey)
      if (event.pid != null) workerPids.add(event.pid)
    }
    if (event.event_type === 'worker_completed' || event.event_type === 'worker_failed') {
      if (workerKey) {
        workerActive.delete(workerKey)
        const started = workerStarts.get(workerKey)
        if (started != null) workerDurations.push(Math.max(0, event.ms - started))
      }
      if (processKey) processActive.delete(processKey)
    }
    if (event.event_type === 'model_call_started') {
      const id = event.model_call_id || event.session_id || `model:${event.ms}:${modelActive.size}`
      modelActive.add(id)
      modelIds.add(id)
    }
    if (event.event_type === 'model_call_completed') {
      const id = event.model_call_id || event.session_id || ''
      if (id) modelActive.delete(id)
    }
    maxWorkers = Math.max(maxWorkers, workerActive.size)
    maxProcesses = Math.max(maxProcesses, processActive.size)
    maxModels = Math.max(maxModels, modelActive.size)
  }

  const requestedWorkers = positiveInt(opts.requestedWorkers, workerStarts.size || workerPids.size || maxWorkers)
  const targetActiveSlots = positiveInt(opts.targetActiveSlots, requestedWorkers)
  const proofMode = opts.proofMode || 'production'
  const allowMissingPids = proofMode === 'in-process-fixture' && opts.allowMissingPids === true
  const requireWorkerPids = opts.requireWorkerPids ?? (
    proofMode === 'production' && requestedWorkers >= 16
  )
  const wallMs = Math.max(0, lastMs - firstMs)
  const sequentialEstimateMs = workerDurations.length
    ? workerDurations.reduce((sum, value) => sum + value, 0)
    : requestedWorkers * positiveInt(opts.expectedWorkerRuntimeMs, 4000)
  const visiblePanes = nonNegativeInt(opts.visiblePanes, sorted.filter((event) => event.placement === 'zellij-pane').length ? new Set(sorted.filter((event) => event.placement === 'zellij-pane').map((event) => event.slot_id || event.session_id || '')).size : 0)
  const observedHeadlessWorkers = sorted.filter((event) => event.placement === 'headless' && (event.event_type === 'worker_launch_invoked' || event.event_type === 'worker_process_spawned')).length
  const headlessWorkers = Math.max(observedHeadlessWorkers, Math.max(0, targetActiveSlots - visiblePanes))
  const minActiveWorkers = opts.minActiveWorkers === undefined
    ? Math.min(targetActiveSlots, requestedWorkers)
    : nonNegativeInt(opts.minActiveWorkers, Math.min(targetActiveSlots, requestedWorkers))
  const minSpeedup = Number.isFinite(Number(opts.minSpeedupRatio)) ? Number(opts.minSpeedupRatio) : requestedWorkers >= 16 ? 5 : 1
  const speedupRatio = wallMs > 0 ? Number((sequentialEstimateMs / wallMs).toFixed(3)) : 0
  const launchEvents = sorted.filter((event) => event.event_type === 'worker_launch_invoked' || event.event_type === 'worker_process_spawned')
  const launchSpanMs = launchEvents.length ? Math.max(...launchEvents.map((event) => event.ms)) - Math.min(...launchEvents.map((event) => event.ms)) : 0
  const firstBatchLimit = positiveInt(opts.firstBatchLaunchSpanLimitMs, requestedWorkers >= 16 ? 2500 : 30000)
  const schedulerState = await readJson<any>(path.join(root, 'agent-scheduler-state.json'), null).catch(() => null)
  const coalescedOverlapWindows = coalesceOverlapWindows(overlapWindows)
  const utilizationProofConsistency = buildUtilizationProofConsistency(schedulerState, {
    proofMaxActive: maxWorkers,
    proofWallMs: wallMs,
    proofActiveSlotTimeMs: activeSlotTimeMsFromWindows(coalescedOverlapWindows)
  })
  const blockers: string[] = []
  if (!sorted.length) blockers.push('parallel_runtime_events_missing')
  if (minActiveWorkers > 0 && maxWorkers < minActiveWorkers) blockers.push('max_observed_active_workers_below_target')
  if (requireWorkerPids && workerPids.size < minActiveWorkers) blockers.push('unique_worker_pids_below_target')
  if (requireWorkerPids && workerPids.size === 0) blockers.push('unique_worker_pids_missing_in_production_proof')
  if (speedupRatio < minSpeedup) blockers.push('speedup_ratio_below_target')
  if (firstBatchLaunchSpanMs > firstBatchLimit) blockers.push('first_batch_launch_span_above_limit')

  return {
    schema: PARALLEL_RUNTIME_PROOF_SCHEMA,
    mission_id: missionId,
    generated_at: nowIso(),
    proof_mode: proofMode,
    require_worker_pids: requireWorkerPids,
    allow_missing_pids: allowMissingPids,
    requested_workers: requestedWorkers,
    target_active_slots: targetActiveSlots,
    max_observed_active_workers: maxWorkers,
    max_observed_worker_processes: Math.max(maxProcesses, workerPids.size ? maxProcesses : maxWorkers),
    unique_worker_pids: workerPids.size,
    unique_model_call_ids: modelIds.size,
    max_observed_model_calls: maxModels,
    launch_span_ms: launchSpanMs,
    first_batch_launch_span_ms: firstBatchLaunchSpanMs,
    wall_ms: wallMs,
    sequential_estimate_ms: sequentialEstimateMs,
    speedup_ratio: speedupRatio,
    overlap_windows: coalescedOverlapWindows,
    visible_panes: visiblePanes,
    headless_workers: headlessWorkers,
    utilization_proof_consistency: utilizationProofConsistency,
    passed: blockers.length === 0,
    blockers
  }
}

export async function writeParallelRuntimeProof(root: string, missionId: string, opts: Parameters<typeof buildParallelRuntimeProof>[2] = {}): Promise<ParallelRuntimeProof> {
  const proof = await buildParallelRuntimeProof(root, missionId, opts)
  await writeJsonAtomic(parallelRuntimeProofPath(root, missionId), proof)
  return proof
}

async function readParallelRuntimeEvents(root: string, missionId: string): Promise<ParallelRuntimeEvent[]> {
  const text = await readText(parallelRuntimeEventPath(root, missionId), '')
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line)
        return parsed?.schema === PARALLEL_RUNTIME_EVENT_SCHEMA ? parsed as ParallelRuntimeEvent : null
      } catch {
        return null
      }
    })
    .filter((row): row is ParallelRuntimeEvent => Boolean(row))
}

function normalizeParallelRuntimeEvent(
  missionId: string,
  event: Omit<Partial<ParallelRuntimeEvent>, 'schema' | 'ts' | 'ms' | 'mission_id'> & { event_type: ParallelRuntimeEventType }
): ParallelRuntimeEvent {
  return {
    schema: PARALLEL_RUNTIME_EVENT_SCHEMA,
    ts: nowIso(),
    ms: Date.now(),
    mission_id: missionId,
    event_type: event.event_type,
    slot_id: event.slot_id == null ? null : String(event.slot_id),
    generation_index: event.generation_index == null ? null : Math.max(1, Math.floor(Number(event.generation_index) || 1)),
    session_id: event.session_id == null ? null : String(event.session_id),
    pid: event.pid == null || !Number.isFinite(Number(event.pid)) ? null : Math.floor(Number(event.pid)),
    backend: String(event.backend || 'unknown'),
    placement: normalizePlacement(event.placement),
    ...(event.worktree_id === undefined ? {} : { worktree_id: event.worktree_id == null ? null : String(event.worktree_id) }),
    ...(event.model_call_id === undefined ? {} : { model_call_id: event.model_call_id == null ? null : String(event.model_call_id) }),
    ...(event.batch_id === undefined ? {} : { batch_id: event.batch_id == null ? null : String(event.batch_id) }),
    ...(event.meta && typeof event.meta === 'object' ? { meta: event.meta } : {})
  }
}

function normalizePlacement(value: unknown): ParallelRuntimePlacement {
  const text = String(value || 'unknown')
  if (text === 'zellij-pane' || text === 'process' || text === 'headless') return text
  return 'unknown'
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return Math.max(1, Math.floor(fallback || 1))
  return Math.floor(parsed)
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return Math.max(0, Math.floor(fallback || 0))
  return Math.floor(parsed)
}

function buildUtilizationProofConsistency(state: any, input: { proofMaxActive: number; proofWallMs: number; proofActiveSlotTimeMs: number }) {
  if (!state || typeof state !== 'object') {
    return {
      ok: true,
      scheduler_max_active: 0,
      proof_max_active: input.proofMaxActive,
      wall_ms_delta: 0,
      scheduler_active_slot_time_ms: 0,
      proof_active_slot_time_ms: input.proofActiveSlotTimeMs,
      active_slot_time_ms_delta: 0,
      scheduler_observation_delay_tolerance_ms: 0
    }
  }
  const schedulerMaxActive = nonNegativeInt(state.max_observed_active_slots, 0)
  const schedulerWallMs = nonNegativeInt(state.wall_time_ms, 0)
  const schedulerActiveSlotTimeMs = nonNegativeInt(state.active_slot_time_ms, 0)
  const wallDelta = Math.abs(schedulerWallMs - input.proofWallMs)
  const activeSlotDelta = Math.abs(schedulerActiveSlotTimeMs - input.proofActiveSlotTimeMs)
  const maxActiveDelta = Math.abs(schedulerMaxActive - input.proofMaxActive)
  const wallToleranceMs = Math.max(500, Math.round(Math.max(schedulerWallMs, input.proofWallMs) * 0.25))
  const activeSlotToleranceMs = Math.max(500, Math.round(Math.max(schedulerActiveSlotTimeMs, input.proofActiveSlotTimeMs) * 0.25))
  const observationDelayToleranceMs = Math.max(activeSlotToleranceMs, wallDelta * Math.max(1, schedulerMaxActive))
  const wallConsistent = wallDelta <= wallToleranceMs
  const activeSlotConsistent = schedulerActiveSlotTimeMs > 0 && input.proofActiveSlotTimeMs > 0 && (
    activeSlotDelta <= activeSlotToleranceMs
    || (schedulerActiveSlotTimeMs >= input.proofActiveSlotTimeMs && activeSlotDelta <= observationDelayToleranceMs)
  )
  return {
    ok: maxActiveDelta <= 1 && (wallConsistent || activeSlotConsistent),
    scheduler_max_active: schedulerMaxActive,
    proof_max_active: input.proofMaxActive,
    wall_ms_delta: wallDelta,
    scheduler_active_slot_time_ms: schedulerActiveSlotTimeMs,
    proof_active_slot_time_ms: input.proofActiveSlotTimeMs,
    active_slot_time_ms_delta: activeSlotDelta,
    scheduler_observation_delay_tolerance_ms: observationDelayToleranceMs
  }
}

function activeSlotTimeMsFromWindows(windows: ParallelRuntimeProof['overlap_windows']) {
  return windows.reduce((sum, window) => sum + Math.max(0, window.end_ms - window.start_ms) * Math.max(0, window.active_workers), 0)
}

function coalesceOverlapWindows(windows: ParallelRuntimeProof['overlap_windows']) {
  return windows
    .filter((window) => window.end_ms > window.start_ms)
    .filter((window) => window.active_workers > 0 || window.active_model_calls > 0)
    .slice(0, 2000)
}

function inferAgentsDir(root: string, missionId: string): string {
  const resolved = path.resolve(root)
  if (path.basename(resolved) === 'agents' && path.basename(path.dirname(resolved)) === missionId) return resolved
  if (path.basename(resolved) === missionId && path.basename(path.dirname(resolved)) === 'missions') return path.join(resolved, 'agents')
  const marker = `${path.sep}.sneakoscope${path.sep}missions${path.sep}${missionId}${path.sep}`
  const index = resolved.indexOf(marker)
  if (index >= 0) return path.join(resolved.slice(0, index + marker.length - 1), 'agents')
  return path.join(resolved, '.sneakoscope', 'missions', missionId, 'agents')
}

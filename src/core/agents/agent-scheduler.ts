import path from 'node:path'
import { appendJsonl, nowIso, writeJsonAtomic } from '../fsx.js'
import { MAX_AGENT_COUNT } from './agent-schema.js'
import {
  appendAgentWorkQueueEvent,
  completeWorkItem,
  createAgentWorkQueue,
  enqueueFollowUpWorkItems,
  leaseNextWorkItem,
  pendingWorkItems,
  writeAgentWorkQueue,
  type AgentWorkQueue
} from './agent-work-queue.js'
import {
  closeWorkerSlotsAfterDrain,
  createAgentWorkerSlots,
  markWorkerSlotGenerationClosed,
  openWorkerSlotGeneration,
  writeAgentWorkerSlots,
  type AgentWorkerSlot
} from './agent-worker-slot.js'
import {
  closeAgentSessionGeneration,
  createAgentSessionGeneration,
  writeAgentSessionGeneration,
  type AgentSessionGeneration
} from './agent-session-generation.js'
import { appendParallelRuntimeEvent } from './parallel-runtime-proof.js'

export const AGENT_SCHEDULER_SCHEMA = 'sks.agent-scheduler.v1'
export const AGENT_SCHEDULER_EVENT_SCHEMA = 'sks.agent-scheduler-event.v1'

export interface AgentSchedulerState {
  schema: typeof AGENT_SCHEDULER_SCHEMA
  updated_at: string
  mission_id: string
  status: 'initializing' | 'running' | 'draining' | 'drained' | 'blocked'
  target_active_slots: number
  max_active_slots: number
  total_work_items: number
  active_slot_count: number
  pending_count: number
  completed_count: number
  failed_count: number
  blocked_count: number
  max_observed_active_slots: number
  backfill_count: number
  expected_backfill_count: number
  generated_work_item_count: number
  refill_delay_ms: number
  refill_latency_events_ms: number[]
  refill_latency_p95_ms: number
  rate_limit_backoff_ms: number
  ticks: number
  active: Record<string, { slot_id: string; work_item_id: string; session_id: string }>
  completed: string[]
  failed: string[]
  blocked: string[]
  pending_queue_drained: boolean
  all_slots_closed_after_drain: boolean
  all_generations_closed: boolean
  blockers: string[]
  batch_dispatch_count: number
  largest_batch_size: number
  first_batch_launch_span_ms: number
  average_batch_launch_span_ms: number
  scheduler_utilization: number
  active_slot_time_ms: number
  wall_time_ms: number
}

type PendingLaunch = {
  slotIndex: number
  slot: AgentWorkerSlot
  openedSlot: AgentWorkerSlot
  generation: AgentSessionGeneration
  agent: any
  workItem: any
  provisionalSessionId: string
}

export type AgentSchedulerLaunchContext = {
  agent: any
  workItem: any
  generation: AgentSessionGeneration
  slot: AgentWorkerSlot
  queue: AgentWorkQueue
  state: AgentSchedulerState
}

export type AgentSchedulerEventContext = {
  event: Record<string, unknown>
  state: AgentSchedulerState
  slots: AgentWorkerSlot[]
  queue: AgentWorkQueue
}

export async function runAgentScheduler(input: {
  root: string
  missionId: string
  rootHash: string
  roster: any
  partition?: any
  prompt?: string
  targetActiveSlots?: number
  maxActiveSlots?: number
  refillDelayMs?: number
  rateLimitBackoffMs?: number
  maxQueueExpansion?: number
  sourceIntelligenceRefs?: Record<string, unknown> | null
  goalModeRef?: Record<string, unknown> | null
  launchSession: (ctx: AgentSchedulerLaunchContext) => Promise<any>
  onSchedulerEvent?: (ctx: AgentSchedulerEventContext) => Promise<void>
}) {
  const maxActiveSlots = Number.isFinite(Number(input.maxActiveSlots)) && Number(input.maxActiveSlots) >= 1 ? Math.floor(Number(input.maxActiveSlots)) : MAX_AGENT_COUNT
  const targetActiveSlots = normalizeTargetActiveSlots(input.targetActiveSlots ?? input.roster?.agent_count ?? input.roster?.concurrency ?? 5, maxActiveSlots)
  let slots = createAgentWorkerSlots(input.roster, targetActiveSlots)
  const queue = createAgentWorkQueue({
    slices: input.partition?.slices || [],
    prompt: input.prompt || '',
    sourceIntelligenceRefs: input.sourceIntelligenceRefs || null,
    goalModeRef: input.goalModeRef || null,
    ...(input.maxQueueExpansion === undefined ? {} : { maxQueueExpansion: input.maxQueueExpansion })
  })
  const active = new Map<string, { slot_id: string; work_item_id: string; session_id: string; promise: Promise<any> }>()
  const results: any[] = []
  const schedulerStartedAt = Date.now()
  let lastUtilizationUpdateMs = schedulerStartedAt
  let activeSlotTimeMs = 0
  let batchCounter = 0
  let batchLaunchSpanTotalMs = 0
  let batchDispatchInProgress = false
  let state: AgentSchedulerState = buildState(input.missionId, targetActiveSlots, queue, slots, active, {
    status: 'initializing',
    refillDelayMs: input.refillDelayMs || 0,
    rateLimitBackoffMs: input.rateLimitBackoffMs || 0
  })
  await writeAll(input.root, state, slots, queue, active, { event_type: 'scheduler_initialized' }, input.onSchedulerEvent)
  await refillSlots(null)

  while (active.size > 0 || pendingWorkItems(queue).length > 0) {
    if (!batchDispatchInProgress && active.size === 0 && pendingWorkItems(queue).length > 0) {
      state.blockers.push('scheduler_pending_queue_without_active_sessions')
      state.status = 'blocked'
      await writeAll(input.root, state, slots, queue, active, { event_type: 'scheduler_blocked', pending_count: pendingWorkItems(queue).length }, input.onSchedulerEvent)
      break
    }
    const settled = await Promise.race([...active.values()].map((entry) => entry.promise))
    const entry = active.get(settled.session_id)
    if (!entry) continue
    const activeCountBeforeClose = active.size
    accumulateActiveSlotTime()
    active.delete(settled.session_id)
    const resultStatus = settled.result?.status === 'done' ? 'completed' : settled.result?.status === 'blocked' ? 'blocked' : 'failed'
    completeWorkItem(queue, entry.work_item_id, settled.session_id, resultStatus, settled.error || null)
    const slotIndex = slots.findIndex((slot) => slot.slot_id === entry.slot_id)
    const closingSlot = slotIndex >= 0 ? slots[slotIndex] : null
    if (slotIndex >= 0 && closingSlot) slots[slotIndex] = markWorkerSlotGenerationClosed(closingSlot, settled.session_id, resultStatus)
    await closeAgentSessionGeneration(input.root, settled.session_id, {
      status: resultStatus === 'completed' ? 'closed' : resultStatus,
      resultArtifactPath: settled.result?.artifacts?.[0] || null,
      terminalCloseReportPath: settled.terminal_close_report_path || path.join('sessions', entry.slot_id, `gen-${settled.generation_index}`, 'agent-terminal-close-report.json')
    })
    results.push(settled.result)
    const followUps = Array.isArray(settled.result?.follow_up_work_items) ? settled.result.follow_up_work_items : []
    if (followUps.length) {
      const enqueue = enqueueFollowUpWorkItems(queue, followUps, {
        originSessionId: settled.session_id,
        sourceIntelligenceRefs: input.sourceIntelligenceRefs || null,
        goalModeRef: input.goalModeRef || null
      })
      if (enqueue.blocked.length) state.blockers.push(...enqueue.blocked)
      await appendAgentWorkQueueEvent(input.root, 'follow_up_work_items_enqueued', { accepted: enqueue.accepted.length, blocked: enqueue.blocked_count })
    }
    const pendingAfterClose = pendingWorkItems(queue).length
    if (pendingAfterClose > 0) state.expected_backfill_count += 1
    updateUtilizationMetrics()
    await writeAll(input.root, state, slots, queue, active, {
      event_type: 'session_completed',
      session_id: settled.session_id,
      slot_id: entry.slot_id,
      work_item_id: entry.work_item_id,
      active_count_before_close: activeCountBeforeClose,
      active_count_after_close: active.size,
      pending_count_after_close: pendingAfterClose
    }, input.onSchedulerEvent)
    await refillSlots(pendingAfterClose > 0 ? {
      closed_session_id: settled.session_id,
      active_count_before: active.size,
      closed_at_ms: Date.now()
    } : null)
  }

  updateUtilizationMetrics()
  state.status = 'draining'
  await writeAll(input.root, state, slots, queue, active, { event_type: 'scheduler_draining' }, input.onSchedulerEvent)
  slots = closeWorkerSlotsAfterDrain(slots)
  state = buildState(input.missionId, targetActiveSlots, queue, slots, active, {
    previous: state,
    status: state.blockers.length ? 'blocked' : 'drained',
    refillDelayMs: input.refillDelayMs || 0,
    rateLimitBackoffMs: input.rateLimitBackoffMs || 0
  })
  state.pending_queue_drained = pendingWorkItems(queue).length === 0
  state.all_slots_closed_after_drain = slots.every((slot) => slot.status === 'closed')
  state.all_generations_closed = true
  if (!state.pending_queue_drained) state.blockers.push('scheduler_pending_queue_not_drained')
  updateUtilizationMetrics()
  await writeAll(input.root, state, slots, queue, active, { event_type: 'scheduler_drained' }, input.onSchedulerEvent)
  return {
    schema: 'sks.agent-scheduler-result.v1',
    ok: state.blockers.length === 0,
    state,
    queue,
    slots,
    results
  }

  async function refillSlots(backfill: { closed_session_id: string; active_count_before: number; closed_at_ms: number } | null) {
    state.status = 'running'
    const launches = collectLaunchBatch()
    if (!launches.length) return
    batchDispatchInProgress = true
    const batchId = `batch-${Date.now().toString(36)}-${batchCounter++}`
    const batchStart = Date.now()
    const launchEvents: Record<string, unknown>[] = []
    try {
      for (const launch of launches) slots[launch.slotIndex] = launch.openedSlot
      await Promise.all(launches.map((launch) => writeAgentSessionGeneration(input.root, launch.generation)))
      await writeAll(input.root, state, slots, queue, active, {
        event_type: 'batch_dispatch_started',
        batch_id: batchId,
        launch_count: launches.length,
        session_ids: launches.map((launch) => launch.generation.session_id)
      }, input.onSchedulerEvent)
      await appendParallelRuntimeEvent(input.root, input.missionId, {
        event_type: 'batch_dispatch_started',
        slot_id: null,
        generation_index: null,
        session_id: null,
        pid: null,
        backend: 'scheduler',
        placement: 'unknown',
        batch_id: batchId,
        meta: { launch_count: launches.length, active_count_before: active.size }
      }).catch(() => undefined)
      for (const launch of launches) {
        const { slot, openedSlot, generation, agent, workItem } = launch
        await appendParallelRuntimeEvent(input.root, input.missionId, {
          event_type: 'slot_reserved',
          slot_id: slot.slot_id,
          generation_index: generation.generation_index,
          session_id: generation.session_id,
          pid: null,
          backend: 'scheduler',
          placement: 'unknown',
          batch_id: batchId,
          meta: { work_item_id: workItem.id }
        }).catch(() => undefined)
        await appendParallelRuntimeEvent(input.root, input.missionId, {
          event_type: 'worker_launch_invoked',
          slot_id: slot.slot_id,
          generation_index: generation.generation_index,
          session_id: generation.session_id,
          pid: null,
          backend: 'scheduler',
          placement: 'unknown',
          batch_id: batchId,
          meta: { work_item_id: workItem.id }
        }).catch(() => undefined)
        const promise = Promise.resolve()
          .then(() => input.launchSession({ agent, workItem, generation, slot: openedSlot, queue, state }))
        .then((result) => ({
          result,
          session_id: generation.session_id,
          slot_id: slot.slot_id,
          generation_index: generation.generation_index,
          terminal_close_report_path: path.join(generation.artifact_dir, 'agent-terminal-close-report.json')
        }))
        .catch((err: unknown) => ({
          result: {
            schema: 'sks.agent-result.v1',
            mission_id: input.missionId,
            agent_id: agent.id,
            session_id: generation.session_id,
            persona_id: agent.persona_id,
            task_slice_id: workItem.id,
            status: 'failed',
            backend: 'fake',
            summary: err instanceof Error ? err.message : String(err),
            findings: [],
            proposed_changes: [],
            changed_files: [],
            lease_compliance: { ok: true, violations: [] },
            artifacts: [],
            blockers: ['scheduler_launch_failed'],
            confidence: 'failed',
            handoff_notes: '',
            unverified: [],
            writes: [],
            recursion_guard: { ok: true, violations: [] },
            verification: { status: 'failed', checks: [] },
            source_intelligence_refs: input.sourceIntelligenceRefs || null,
            goal_mode_ref: input.goalModeRef || null
          },
          session_id: generation.session_id,
          slot_id: slot.slot_id,
          generation_index: generation.generation_index,
          error: err instanceof Error ? err.message : String(err),
          terminal_close_report_path: path.join(generation.artifact_dir, 'agent-terminal-close-report.json')
        }))
        accumulateActiveSlotTime()
        active.set(generation.session_id, { slot_id: slot.slot_id, work_item_id: workItem.id, session_id: generation.session_id, promise })
      }
      await appendAgentWorkQueueEvent(input.root, 'batch_work_items_dispatched', {
        batch_id: batchId,
        launch_count: launches.length,
        session_ids: launches.map((launch) => launch.generation.session_id),
        work_item_ids: launches.map((launch) => launch.workItem.id)
      })
      for (const launch of launches) await appendAgentWorkQueueEvent(input.root, 'work_item_dispatched', { work_item_id: launch.workItem.id, session_id: launch.generation.session_id, slot_id: launch.slot.slot_id })
      if (backfill) {
        const firstLaunch = launches[0]
        const refillLatencyMs = Math.max(0, Date.now() - backfill.closed_at_ms)
        state.backfill_count += 1
        state.refill_latency_events_ms.push(refillLatencyMs)
        state.refill_latency_p95_ms = percentile95(state.refill_latency_events_ms)
        launchEvents.push({
          event_type: 'backfill_event',
          closed_session_id: backfill.closed_session_id,
          new_session_id: firstLaunch?.generation.session_id || null,
          slot_id: firstLaunch?.slot.slot_id || null,
          batch_id: batchId,
          launch_count: launches.length,
          active_count_before: backfill.active_count_before,
          active_count_after: active.size,
          refill_latency_ms: refillLatencyMs
        })
        backfill = null
      } else {
        for (const launch of launches) launchEvents.push({
          event_type: 'session_launched',
          session_id: launch.generation.session_id,
          slot_id: launch.slot.slot_id,
          work_item_id: launch.workItem.id,
          active_count_after: active.size
        })
      }
      if (input.refillDelayMs && input.refillDelayMs > 0) await delay(input.refillDelayMs)
      const launchSpanMs = Math.max(0, Date.now() - batchStart)
      batchLaunchSpanTotalMs += launchSpanMs
      state.batch_dispatch_count += 1
      state.largest_batch_size = Math.max(state.largest_batch_size, launches.length)
      if (state.first_batch_launch_span_ms === 0) state.first_batch_launch_span_ms = launchSpanMs
      state.average_batch_launch_span_ms = Math.round(batchLaunchSpanTotalMs / Math.max(1, state.batch_dispatch_count))
      updateUtilizationMetrics()
      await appendParallelRuntimeEvent(input.root, input.missionId, {
        event_type: 'batch_dispatch_completed',
        slot_id: null,
        generation_index: null,
        session_id: null,
        pid: null,
        backend: 'scheduler',
        placement: 'unknown',
        batch_id: batchId,
        meta: { launch_count: launches.length, launch_span_ms: launchSpanMs, active_count_after: active.size }
      }).catch(() => undefined)
      await writeAll(input.root, state, slots, queue, active, {
        event_type: 'batch_dispatch_completed',
        batch_id: batchId,
        launch_count: launches.length,
        launch_span_ms: launchSpanMs,
        active_count_after: active.size,
        session_ids: launches.map((launch) => launch.generation.session_id)
      }, input.onSchedulerEvent)
    } finally {
      batchDispatchInProgress = false
    }
    for (const event of launchEvents) await appendJsonl(path.join(input.root, 'agent-scheduler-events.jsonl'), { schema: AGENT_SCHEDULER_EVENT_SCHEMA, ts: nowIso(), ...event })
  }

  function collectLaunchBatch(): PendingLaunch[] {
    const launches: PendingLaunch[] = []
    const reservedSlots = new Set<number>()
    while (active.size + launches.length < targetActiveSlots && pendingWorkItems(queue).length > 0) {
      const slotIndex = slots.findIndex((slot, index) => slot.status === 'idle' && !reservedSlots.has(index))
      if (slotIndex < 0) break
      const slot = slots[slotIndex]
      if (!slot) break
      const generationIndex = slot.generation_count + 1
      const provisionalSessionId = `${slot.slot_id}-gen-${generationIndex}`
      const workItem = leaseNextWorkItem(queue, provisionalSessionId, {
        slotId: slot.slot_id,
        agentId: String(slot.persona_assignment?.agent_id || ''),
        activeWritePaths: activeWritePaths(queue)
      })
      if (!workItem) break
      const generation = createAgentSessionGeneration({
        slotId: slot.slot_id,
        generationIndex,
        missionId: input.missionId,
        rootHash: input.rootHash,
        taskId: workItem.id,
        personaId: String(slot.persona_assignment.persona_id || slot.persona_assignment.agent_id || slot.slot_id),
        sourceIntelligenceRefs: workItem.source_intelligence_refs,
        goalModeRef: workItem.goal_mode_ref
      })
      workItem.running_session_id = generation.session_id
      const openedSlot = openWorkerSlotGeneration(slot, generation)
      const agent = buildAgentForGeneration(slot, generation, workItem)
      launches.push({ slotIndex, slot, openedSlot, generation, agent, workItem, provisionalSessionId })
      reservedSlots.add(slotIndex)
    }
    return launches
  }

  function updateUtilizationMetrics() {
    accumulateActiveSlotTime()
    state.wall_time_ms = Math.max(0, Date.now() - schedulerStartedAt)
    state.active_slot_time_ms = activeSlotTimeMs
    const denominator = Math.max(1, state.wall_time_ms * targetActiveSlots)
    state.scheduler_utilization = Number(Math.min(1, state.active_slot_time_ms / denominator).toFixed(3))
  }

  function accumulateActiveSlotTime() {
    const now = Date.now()
    const delta = Math.max(0, now - lastUtilizationUpdateMs)
    activeSlotTimeMs += active.size * delta
    lastUtilizationUpdateMs = now
  }
}

export function normalizeTargetActiveSlots(value: unknown, maxActiveSlots: number = MAX_AGENT_COUNT) {
  const cap = Number.isFinite(Number(maxActiveSlots)) && Number(maxActiveSlots) >= 1 ? Math.floor(Number(maxActiveSlots)) : MAX_AGENT_COUNT
  const parsed = Number(value ?? 5)
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(cap, 5)
  return Math.min(cap, Math.floor(parsed))
}

function buildState(
  missionId: string,
  targetActiveSlots: number,
  queue: AgentWorkQueue,
  slots: AgentWorkerSlot[],
  active: Map<string, { slot_id: string; work_item_id: string; session_id: string }>,
  opts: { previous?: AgentSchedulerState; status: AgentSchedulerState['status']; refillDelayMs: number; rateLimitBackoffMs: number }
): AgentSchedulerState {
  const previous = opts.previous
  const pendingCount = pendingWorkItems(queue).length
  const completed = queue.items.filter((item) => item.status === 'completed').map((item) => item.id)
  const failed = queue.items.filter((item) => item.status === 'failed').map((item) => item.id)
  const blocked = queue.items.filter((item) => item.status === 'blocked').map((item) => item.id)
  return {
    schema: AGENT_SCHEDULER_SCHEMA,
    updated_at: nowIso(),
    mission_id: missionId,
    status: opts.status,
    target_active_slots: targetActiveSlots,
    max_active_slots: Math.max(MAX_AGENT_COUNT, targetActiveSlots),
    total_work_items: queue.items.length,
    active_slot_count: active.size,
    pending_count: pendingCount,
    completed_count: completed.length,
    failed_count: failed.length,
    blocked_count: blocked.length,
    max_observed_active_slots: Math.max(previous?.max_observed_active_slots || 0, active.size),
    backfill_count: previous?.backfill_count || 0,
    expected_backfill_count: previous?.expected_backfill_count || 0,
    generated_work_item_count: queue.generated_work_item_count,
    refill_delay_ms: opts.refillDelayMs,
    refill_latency_events_ms: previous?.refill_latency_events_ms || [],
    refill_latency_p95_ms: previous?.refill_latency_p95_ms || 0,
    rate_limit_backoff_ms: opts.rateLimitBackoffMs,
    ticks: (previous?.ticks || 0) + 1,
    active: Object.fromEntries([...active.entries()].map(([sessionId, entry]) => [sessionId, { slot_id: entry.slot_id, work_item_id: entry.work_item_id, session_id: entry.session_id }])),
    completed,
    failed,
    blocked,
    pending_queue_drained: pendingCount === 0,
    all_slots_closed_after_drain: slots.length > 0 && slots.every((slot) => slot.status === 'closed'),
    all_generations_closed: false,
    blockers: [...(previous?.blockers || [])]
    ,
    batch_dispatch_count: previous?.batch_dispatch_count || 0,
    largest_batch_size: previous?.largest_batch_size || 0,
    first_batch_launch_span_ms: previous?.first_batch_launch_span_ms || 0,
    average_batch_launch_span_ms: previous?.average_batch_launch_span_ms || 0,
    scheduler_utilization: previous?.scheduler_utilization || 0,
    active_slot_time_ms: previous?.active_slot_time_ms || 0,
    wall_time_ms: previous?.wall_time_ms || 0
  }
}

async function writeAll(
  root: string,
  currentState: AgentSchedulerState,
  slots: AgentWorkerSlot[],
  queue: AgentWorkQueue,
  active: Map<string, { slot_id: string; work_item_id: string; session_id: string }>,
  event: Record<string, unknown>,
  onSchedulerEvent?: (ctx: AgentSchedulerEventContext) => Promise<void>
) {
  const nextState = buildState(currentState.mission_id, currentState.target_active_slots, queue, slots, active, {
    previous: currentState,
    status: currentState.status,
    refillDelayMs: currentState.refill_delay_ms,
    rateLimitBackoffMs: currentState.rate_limit_backoff_ms
  })
  currentState.updated_at = nextState.updated_at
  currentState.total_work_items = nextState.total_work_items
  currentState.active_slot_count = nextState.active_slot_count
  currentState.pending_count = nextState.pending_count
  currentState.completed_count = nextState.completed_count
  currentState.failed_count = nextState.failed_count
  currentState.blocked_count = nextState.blocked_count
  currentState.max_observed_active_slots = nextState.max_observed_active_slots
  currentState.generated_work_item_count = nextState.generated_work_item_count
  currentState.refill_latency_events_ms = nextState.refill_latency_events_ms
  currentState.refill_latency_p95_ms = nextState.refill_latency_p95_ms
  currentState.ticks = nextState.ticks
  currentState.active = nextState.active
  currentState.completed = nextState.completed
  currentState.failed = nextState.failed
  currentState.blocked = nextState.blocked
  currentState.pending_queue_drained = nextState.pending_queue_drained
  currentState.all_slots_closed_after_drain = nextState.all_slots_closed_after_drain
  currentState.batch_dispatch_count = nextState.batch_dispatch_count
  currentState.largest_batch_size = nextState.largest_batch_size
  currentState.first_batch_launch_span_ms = nextState.first_batch_launch_span_ms
  currentState.average_batch_launch_span_ms = nextState.average_batch_launch_span_ms
  currentState.scheduler_utilization = nextState.scheduler_utilization
  currentState.active_slot_time_ms = nextState.active_slot_time_ms
  currentState.wall_time_ms = nextState.wall_time_ms
  await writeAgentWorkQueue(root, queue)
  await writeAgentWorkerSlots(root, slots)
  await writeJsonAtomic(path.join(root, 'agent-scheduler-state.json'), currentState)
  const entry = { schema: AGENT_SCHEDULER_EVENT_SCHEMA, ts: nowIso(), ...event }
  await appendJsonl(path.join(root, 'agent-scheduler-events.jsonl'), entry)
  await onSchedulerEvent?.({ event: entry, state: currentState, slots, queue })
}

function buildAgentForGeneration(slot: AgentWorkerSlot, generation: AgentSessionGeneration, workItem: any) {
  const persona = slot.persona_assignment || {}
  return {
    id: slot.slot_id,
    agent_id: persona.agent_id || slot.slot_id,
    slot_id: slot.slot_id,
    worker_slot_id: slot.slot_id,
    session_id: generation.session_id,
    session_generation_id: generation.session_id,
    generation_index: generation.generation_index,
    session_artifact_dir: generation.artifact_dir,
    persona_id: String(persona.persona_id || persona.agent_id || slot.slot_id),
    role: String(persona.role || workItem.required_persona_category || 'verifier'),
    write_policy: String(persona.write_policy || 'read-only'),
    reasoning_effort: persona.reasoning_effort || null,
    reasoning_profile: persona.reasoning_profile || null,
    service_tier: persona.service_tier || 'fast',
    fast_mode: persona.fast_mode !== false,
    source_intelligence_refs: generation.source_intelligence_refs,
    goal_mode_ref: generation.goal_mode_ref
  }
}

function activeWritePaths(queue: AgentWorkQueue) {
  return queue.items
    .filter((item) => item.status === 'running')
    .flatMap((item) => Array.isArray(item.slice?.write_paths) ? item.slice.write_paths : [])
    .map((file) => String(file || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, ''))
    .filter(Boolean)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function percentile95(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index] || 0
}

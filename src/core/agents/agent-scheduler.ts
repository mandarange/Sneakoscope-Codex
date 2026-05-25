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
  refillDelayMs?: number
  rateLimitBackoffMs?: number
  maxQueueExpansion?: number
  sourceIntelligenceRefs?: Record<string, unknown> | null
  goalModeRef?: Record<string, unknown> | null
  launchSession: (ctx: AgentSchedulerLaunchContext) => Promise<any>
  onSchedulerEvent?: (ctx: AgentSchedulerEventContext) => Promise<void>
}) {
  const targetActiveSlots = normalizeTargetActiveSlots(input.targetActiveSlots ?? input.roster?.agent_count ?? input.roster?.concurrency ?? 5)
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
  let state: AgentSchedulerState = buildState(input.missionId, targetActiveSlots, queue, slots, active, {
    status: 'initializing',
    refillDelayMs: input.refillDelayMs || 0,
    rateLimitBackoffMs: input.rateLimitBackoffMs || 0
  })
  await writeAll(input.root, state, slots, queue, active, { event_type: 'scheduler_initialized' }, input.onSchedulerEvent)
  await refillSlots(null)

  while (active.size > 0 || pendingWorkItems(queue).length > 0) {
    if (active.size === 0 && pendingWorkItems(queue).length > 0) {
      state.blockers.push('scheduler_pending_queue_without_active_sessions')
      state.status = 'blocked'
      await writeAll(input.root, state, slots, queue, active, { event_type: 'scheduler_blocked', pending_count: pendingWorkItems(queue).length }, input.onSchedulerEvent)
      break
    }
    const settled = await Promise.race([...active.values()].map((entry) => entry.promise))
    const entry = active.get(settled.session_id)
    if (!entry) continue
    const activeCountBeforeClose = active.size
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
      active_count_before: active.size
    } : null)
  }

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
  await writeAll(input.root, state, slots, queue, active, { event_type: 'scheduler_drained' }, input.onSchedulerEvent)
  return {
    schema: 'sks.agent-scheduler-result.v1',
    ok: state.blockers.length === 0,
    state,
    queue,
    slots,
    results
  }

  async function refillSlots(backfill: { closed_session_id: string; active_count_before: number } | null) {
    state.status = 'running'
    while (active.size < targetActiveSlots && pendingWorkItems(queue).length > 0) {
      const slotIndex = slots.findIndex((slot) => slot.status === 'idle')
      if (slotIndex < 0) break
      const slot = slots[slotIndex]
      if (!slot) break
      const generationIndex = slot.generation_count + 1
      const provisionalSessionId = `${slot.slot_id}-gen-${generationIndex}`
      const workItem = leaseNextWorkItem(queue, provisionalSessionId)
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
      await writeAgentSessionGeneration(input.root, generation)
      const agent = buildAgentForGeneration(slot, generation, workItem)
      const openedSlot = openWorkerSlotGeneration(slot, generation)
      slots[slotIndex] = openedSlot
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
      active.set(generation.session_id, { slot_id: slot.slot_id, work_item_id: workItem.id, session_id: generation.session_id, promise })
      await appendAgentWorkQueueEvent(input.root, 'work_item_dispatched', { work_item_id: workItem.id, session_id: generation.session_id, slot_id: slot.slot_id })
      if (backfill) {
        state.backfill_count += 1
        await writeAll(input.root, state, slots, queue, active, {
          event_type: 'backfill_event',
          closed_session_id: backfill.closed_session_id,
          new_session_id: generation.session_id,
          slot_id: slot.slot_id,
          active_count_before: backfill.active_count_before,
          active_count_after: active.size
        }, input.onSchedulerEvent)
        backfill = null
      } else {
        await writeAll(input.root, state, slots, queue, active, {
          event_type: 'session_launched',
          session_id: generation.session_id,
          slot_id: slot.slot_id,
          work_item_id: workItem.id,
          active_count_after: active.size
        }, input.onSchedulerEvent)
      }
      if (input.refillDelayMs && input.refillDelayMs > 0) await delay(input.refillDelayMs)
    }
  }
}

export function normalizeTargetActiveSlots(value: unknown) {
  const parsed = Number(value ?? 5)
  if (!Number.isFinite(parsed) || parsed < 1) return 5
  return Math.min(MAX_AGENT_COUNT, Math.floor(parsed))
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
    max_active_slots: MAX_AGENT_COUNT,
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
  currentState.ticks = nextState.ticks
  currentState.active = nextState.active
  currentState.completed = nextState.completed
  currentState.failed = nextState.failed
  currentState.blocked = nextState.blocked
  currentState.pending_queue_drained = nextState.pending_queue_drained
  currentState.all_slots_closed_after_drain = nextState.all_slots_closed_after_drain
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
    source_intelligence_refs: generation.source_intelligence_refs,
    goal_mode_ref: generation.goal_mode_ref
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

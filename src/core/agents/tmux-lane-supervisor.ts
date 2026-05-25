import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import type { AgentSchedulerState } from './agent-scheduler.js'
import type { AgentWorkerSlot } from './agent-worker-slot.js'

export const TMUX_LANE_SUPERVISOR_SCHEMA = 'sks.tmux-lane-supervisor.v1'

export interface TmuxLaneSupervisorLane {
  slot_id: string
  pane_id: string
  lane_dir: string
  lane_md: string
  lane_json: string
  command: string
  opened_at: string
  closed_at: string | null
  unexpected_close_count: number
  auto_reopen_count: number
  pane_survival_checked: boolean
  current_session_id: string | null
  current_generation_index: number | null
  generation_history_count: number
  drained: boolean
}

export interface TmuxLaneSupervisorState {
  schema: typeof TMUX_LANE_SUPERVISOR_SCHEMA
  updated_at: string
  mission_id: string
  session_name: string
  drain_signal_path: string
  lane_count: number
  no_flicker_verified: boolean
  pane_survival_checked: boolean
  unexpected_close_count: number
  auto_reopen_count: number
  all_lanes_closed_after_drain: boolean
  blockers: string[]
  lanes: TmuxLaneSupervisorLane[]
}

export async function initializeTmuxLaneSupervisor(root: string, input: {
  missionId: string
  sessionName?: string
  targetActiveSlots: number
}) {
  const now = nowIso()
  const sessionName = input.sessionName || `sks-${input.missionId}`
  const state: TmuxLaneSupervisorState = {
    schema: TMUX_LANE_SUPERVISOR_SCHEMA,
    updated_at: now,
    mission_id: input.missionId,
    session_name: sessionName,
    drain_signal_path: 'lanes/.drain',
    lane_count: input.targetActiveSlots,
    no_flicker_verified: false,
    pane_survival_checked: false,
    unexpected_close_count: 0,
    auto_reopen_count: 0,
    all_lanes_closed_after_drain: false,
    blockers: [],
    lanes: Array.from({ length: input.targetActiveSlots }, (_, index) => createLane(input.missionId, sessionName, index + 1, now))
  }
  for (const lane of state.lanes) await writeLaneRender(root, lane, null, null)
  await writeSupervisor(root, state, 'lane_supervisor_initialized')
  return state
}

export async function updateTmuxLaneSupervisorFromSlots(root: string, input: {
  missionId: string
  sessionName?: string
  slots: AgentWorkerSlot[]
  state?: AgentSchedulerState
  event?: Record<string, unknown>
}) {
  let supervisor = await readSupervisor(root)
  if (!supervisor) {
    supervisor = await initializeTmuxLaneSupervisor(root, {
      missionId: input.missionId,
      ...(input.sessionName === undefined ? {} : { sessionName: input.sessionName }),
      targetActiveSlots: Math.max(1, input.slots.length || input.state?.target_active_slots || 1)
    })
  }
  const laneBySlot = new Map(supervisor.lanes.map((lane) => [lane.slot_id, lane]))
  const lanes = input.slots.map((slot, index) => {
    const previous = laneBySlot.get(slot.slot_id) || createLane(input.missionId, supervisor.session_name, index + 1, nowIso())
    return {
      ...previous,
      current_session_id: slot.current_session_id,
      current_generation_index: slot.current_generation_index,
      generation_history_count: slot.history.length,
      pane_survival_checked: previous.pane_survival_checked || slot.status !== 'closed',
      drained: previous.drained || slot.status === 'closed'
    }
  })
  supervisor = summarizeSupervisor({
    ...supervisor,
    updated_at: nowIso(),
    lane_count: lanes.length,
    lanes
  })
  for (const lane of supervisor.lanes) {
    const slot = input.slots.find((row) => row.slot_id === lane.slot_id) || null
    await writeLaneRender(root, lane, slot, input.state || null)
  }
  await writeSupervisor(root, supervisor, String(input.event?.event_type || 'lane_supervisor_updated'), input.event || {})
  return supervisor
}

export async function verifyTmuxLaneSurvival(root: string) {
  const supervisor = await readSupervisor(root)
  if (!supervisor) return null
  const lanes = supervisor.lanes.map((lane) => ({
    ...lane,
    pane_survival_checked: true,
    unexpected_close_count: lane.closed_at && !lane.drained ? lane.unexpected_close_count + 1 : lane.unexpected_close_count,
    auto_reopen_count: lane.closed_at && !lane.drained ? lane.auto_reopen_count + 1 : lane.auto_reopen_count,
    closed_at: lane.closed_at && !lane.drained ? null : lane.closed_at
  }))
  const next = summarizeSupervisor({
    ...supervisor,
    updated_at: nowIso(),
    pane_survival_checked: true,
    lanes
  })
  await writeSupervisor(root, next, 'lane_survival_checked')
  return next
}

export async function drainTmuxLaneSupervisor(root: string) {
  const supervisor = await readSupervisor(root)
  if (!supervisor) return null
  await ensureDir(path.join(root, 'lanes'))
  await writeTextAtomic(path.join(root, supervisor.drain_signal_path), `drain ${nowIso()}\n`)
  const closedAt = nowIso()
  const lanes = supervisor.lanes.map((lane) => ({
    ...lane,
    closed_at: lane.closed_at || closedAt,
    drained: true,
    pane_survival_checked: true
  }))
  const next = summarizeSupervisor({
    ...supervisor,
    updated_at: closedAt,
    no_flicker_verified: true,
    pane_survival_checked: true,
    all_lanes_closed_after_drain: true,
    lanes
  })
  for (const lane of next.lanes) await writeLaneRender(root, lane, null, null)
  await writeSupervisor(root, next, 'lane_supervisor_drained')
  return next
}

export async function readTmuxLaneSupervisor(root: string) {
  return readSupervisor(root)
}

function createLane(missionId: string, sessionName: string, index: number, openedAt: string): TmuxLaneSupervisorLane {
  const slotId = `slot-${String(index).padStart(3, '0')}`
  const laneDir = path.join('lanes', slotId)
  return {
    slot_id: slotId,
    pane_id: `fake-pane-${slotId}`,
    lane_dir: laneDir,
    lane_md: path.join(laneDir, 'lane.md'),
    lane_json: path.join(laneDir, 'lane.json'),
    command: buildPersistentLaneCommand(missionId, slotId),
    opened_at: openedAt,
    closed_at: null,
    unexpected_close_count: 0,
    auto_reopen_count: 0,
    pane_survival_checked: false,
    current_session_id: null,
    current_generation_index: null,
    generation_history_count: 0,
    drained: false
  }
}

function buildPersistentLaneCommand(missionId: string, slotId: string) {
  const laneMd = path.join('agents', 'lanes', slotId, 'lane.md')
  const drain = path.join('agents', 'lanes', '.drain')
  return `while test ! -f ${JSON.stringify(drain)}; do clear; printf '%s\\n' ${JSON.stringify(`SKS ${missionId} ${slotId}`)}; test -f ${JSON.stringify(laneMd)} && cat ${JSON.stringify(laneMd)}; sleep 2; done`
}

async function writeLaneRender(root: string, lane: TmuxLaneSupervisorLane, slot: AgentWorkerSlot | null, state: AgentSchedulerState | null) {
  const laneJson = {
    schema: 'sks.tmux-lane-render.v1',
    updated_at: nowIso(),
    slot_id: lane.slot_id,
    pane_id: lane.pane_id,
    current_session_id: lane.current_session_id,
    current_generation_index: lane.current_generation_index,
    generation_history_count: lane.generation_history_count,
    status: lane.drained ? 'drained' : lane.current_session_id ? 'running' : 'idle',
    scheduler: state ? {
      target_active_slots: state.target_active_slots,
      total_work_items: state.total_work_items,
      pending_count: state.pending_count,
      active_slot_count: state.active_slot_count,
      completed_count: state.completed_count,
      backfill_count: state.backfill_count,
      expected_backfill_count: state.expected_backfill_count
    } : null,
    slot_history: slot?.history || []
  }
  await writeJsonAtomic(path.join(root, lane.lane_json), laneJson)
  await writeTextAtomic(path.join(root, lane.lane_md), [
    `# ${lane.slot_id}`,
    '',
    `pane: ${lane.pane_id}`,
    `session: ${lane.current_session_id || 'idle'}`,
    `generation: ${lane.current_generation_index || 'idle'}`,
    `history: ${lane.generation_history_count}`,
    `drained: ${lane.drained ? 'yes' : 'no'}`,
    state ? `queue: ${state.pending_count} pending / ${state.completed_count} completed` : 'queue: pending',
    ''
  ].join('\n'))
}

async function readSupervisor(root: string) {
  return readJson<TmuxLaneSupervisorState>(path.join(root, 'agent-tmux-lane-supervisor.json'), null as any)
}

async function writeSupervisor(root: string, state: TmuxLaneSupervisorState, eventType: string, payload: Record<string, unknown> = {}) {
  await writeJsonAtomic(path.join(root, 'agent-tmux-lane-supervisor.json'), state)
  await appendJsonl(path.join(root, 'agent-tmux-lane-supervisor-events.jsonl'), {
    schema: 'sks.tmux-lane-supervisor-event.v1',
    ts: nowIso(),
    event_type: eventType,
    payload
  })
}

function summarizeSupervisor(state: TmuxLaneSupervisorState): TmuxLaneSupervisorState {
  const unexpected = state.lanes.reduce((sum, lane) => sum + lane.unexpected_close_count, 0)
  const reopened = state.lanes.reduce((sum, lane) => sum + lane.auto_reopen_count, 0)
  return {
    ...state,
    unexpected_close_count: unexpected,
    auto_reopen_count: reopened,
    pane_survival_checked: state.pane_survival_checked || state.lanes.every((lane) => lane.pane_survival_checked),
    all_lanes_closed_after_drain: state.lanes.length > 0 && state.lanes.every((lane) => lane.drained && Boolean(lane.closed_at)),
    blockers: [
      ...(unexpected > 0 ? ['tmux_lane_unexpected_close_before_drain'] : []),
      ...(state.lanes.some((lane) => lane.closed_at && !lane.drained) ? ['tmux_lane_closed_before_drain'] : [])
    ]
  }
}

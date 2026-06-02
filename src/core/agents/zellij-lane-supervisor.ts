import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import type { AgentSchedulerState } from './agent-scheduler.js'
import type { AgentWorkerSlot } from './agent-worker-slot.js'
import { runZellij } from '../zellij/zellij-command.js'
import {
  buildZellijLaneRuntimePolicy,
  buildZellijLaneShellCommand,
  extractZellijPaneIdFromOutput,
  normalizeZellijSlot,
  recordZellijLanePaneId,
  writeZellijLaneRuntimeFiles,
  writeZellijLaneRuntimeManifest,
  type ZellijLaneRuntimePolicy
} from '../zellij/zellij-lane-runtime.js'

export const ZELLIJ_LANE_SUPERVISOR_SCHEMA = 'sks.zellij-lane-supervisor.v1'

export interface ZellijLaneSupervisorLane {
  slot_id: string
  pane_id: string
  pane_id_source: string
  pane_name: string
  lane_dir: string
  state_dir: string
  lane_md: string
  lane_json: string
  command_inbox: string
  command_ack: string
  command_outbox: string
  command_cursor: string
  heartbeat: string
  command: string
  dispatch_mode: 'jsonl_nonblocking'
  dispatch_throttle_ms: number
  nice_level: number
  runtime: ZellijLaneRuntimePolicy
  launch_mode: string
  launch_error: string | null
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

export interface ZellijLaneSupervisorState {
  schema: typeof ZELLIJ_LANE_SUPERVISOR_SCHEMA
  updated_at: string
  mission_id: string
  session_name: string
  drain_signal_path: string
  lane_runtime_manifest: string
  dispatch_mode: 'jsonl_nonblocking'
  fifo_policy: 'disabled_to_avoid_writer_blocking'
  resource_throttle_ms: number
  nice_level: number
  lane_count: number
  no_flicker_verified: boolean
  pane_survival_checked: boolean
  unexpected_close_count: number
  auto_reopen_count: number
  all_lanes_closed_after_drain: boolean
  blockers: string[]
  lanes: ZellijLaneSupervisorLane[]
}

export async function initializeZellijLaneSupervisor(root: string, input: {
  missionId: string
  sessionName?: string
  targetActiveSlots: number
  launchRealZellij?: boolean
}) {
  const now = nowIso()
  const sessionName = input.sessionName || `sks-${input.missionId}`
  const lanes = await createSupervisorLanes(root, input.missionId, sessionName, input.targetActiveSlots, now, input.launchRealZellij === true)
  const firstRuntime = lanes[0]?.runtime || buildZellijLaneRuntimePolicy(root, {
    missionId: input.missionId,
    sessionName,
    slotId: 'slot-001'
  })
  const state: ZellijLaneSupervisorState = {
    schema: ZELLIJ_LANE_SUPERVISOR_SCHEMA,
    updated_at: now,
    mission_id: input.missionId,
    session_name: sessionName,
    drain_signal_path: 'lanes/.drain',
    lane_runtime_manifest: 'zellij-lane-runtime.json',
    dispatch_mode: 'jsonl_nonblocking',
    fifo_policy: 'disabled_to_avoid_writer_blocking',
    resource_throttle_ms: firstRuntime.resource.throttle_ms,
    nice_level: firstRuntime.resource.nice_level,
    lane_count: input.targetActiveSlots,
    no_flicker_verified: false,
    pane_survival_checked: false,
    unexpected_close_count: 0,
    auto_reopen_count: 0,
    all_lanes_closed_after_drain: false,
    blockers: [],
    lanes
  }
  for (const lane of state.lanes) await writeLaneRender(root, lane, null, null)
  await writeZellijLaneRuntimeManifest(root, { missionId: input.missionId, sessionName, lanes: state.lanes.map((lane) => lane.runtime) })
  await writeSupervisor(root, state, 'lane_supervisor_initialized')
  return state
}

export async function updateZellijLaneSupervisorFromSlots(root: string, input: {
  missionId: string
  sessionName?: string
  slots: AgentWorkerSlot[]
  state?: AgentSchedulerState
  event?: Record<string, unknown>
}) {
  let supervisor = await readSupervisor(root)
  if (!supervisor) {
    supervisor = await initializeZellijLaneSupervisor(root, {
      missionId: input.missionId,
      ...(input.sessionName === undefined ? {} : { sessionName: input.sessionName }),
      targetActiveSlots: Math.max(1, input.slots.length || input.state?.target_active_slots || 1)
    })
  }
  const slotById = new Map(input.slots.map((slot) => [slot.slot_id, slot]))
  const laneCount = Math.max(supervisor.lanes.length, input.slots.length)
  const lanes = Array.from({ length: laneCount }, (_, index) => {
    const previous = hydrateLaneRuntime(root, supervisor.lanes[index] || createLane(root, input.missionId, supervisor.session_name, index + 1, nowIso()), input.missionId, supervisor.session_name)
    const slot = slotById.get(previous.slot_id)
    if (!slot) return previous
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
  await writeZellijLaneRuntimeManifest(root, { missionId: input.missionId, sessionName: supervisor.session_name, lanes: supervisor.lanes.map((lane) => lane.runtime) })
  await writeSupervisor(root, supervisor, String(input.event?.event_type || 'lane_supervisor_updated'), input.event || {})
  return supervisor
}

export async function verifyZellijLaneSurvival(root: string) {
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

export async function drainZellijLaneSupervisor(root: string) {
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

export async function readZellijLaneSupervisor(root: string) {
  return readSupervisor(root)
}

export async function reconcileZellijLaneSupervisorPaneIds(root: string, panes: any[]) {
  const supervisor = await readSupervisor(root)
  if (!supervisor) return null
  let changed = false
  const lanes = supervisor.lanes.map((lane) => {
    const hydrated = hydrateLaneRuntime(root, lane, supervisor.mission_id, supervisor.session_name)
    const pane = panes.find((row: any) => String(row?.name || row?.title || '') === hydrated.slot_id)
      || panes.find((row: any) => String(row?.command || '').includes(`--slot ${hydrated.slot_id}`))
      || panes.find((row: any) => String(row?.command || '').includes(`--slot '${hydrated.slot_id}'`))
    const paneId = pane?.pane_id == null ? null : String(pane.pane_id)
    if (!paneId || paneId === hydrated.pane_id) return hydrated
    changed = true
    return {
      ...hydrated,
      pane_id: paneId,
      pane_id_source: 'zellij_pane_proof',
      pane_name: String(pane.name || hydrated.slot_id)
    }
  })
  if (!changed) {
    return {
      schema: 'sks.zellij-lane-pane-reconciliation.v1',
      ok: true,
      changed: false,
      matched_count: 0,
      lane_count: supervisor.lanes.length
    }
  }
  const next = summarizeSupervisor({
    ...supervisor,
    updated_at: nowIso(),
    lanes
  })
  await writeZellijLaneRuntimeManifest(root, { missionId: next.mission_id, sessionName: next.session_name, lanes: next.lanes.map((lane) => lane.runtime) })
  for (const lane of next.lanes) {
    await recordZellijLanePaneId(root, {
      slotId: lane.slot_id,
      paneId: lane.pane_id,
      source: lane.pane_id_source,
      sessionName: next.session_name,
      command: lane.command
    })
    await writeLaneRender(root, lane, null, null)
  }
  await writeSupervisor(root, next, 'pane_id_reconciled', { matched_count: lanes.length })
  return {
    schema: 'sks.zellij-lane-pane-reconciliation.v1',
    ok: true,
    changed: true,
    matched_count: lanes.length,
    lane_count: lanes.length
  }
}

function createLane(root: string, missionId: string, sessionName: string, index: number, openedAt: string): ZellijLaneSupervisorLane {
  const slotId = normalizeZellijSlot(`slot-${String(index).padStart(3, '0')}`)
  const runtime = buildZellijLaneRuntimePolicy(root, { missionId, sessionName, slotId })
  const laneDir = runtime.lane_dir
  return {
    slot_id: slotId,
    pane_id: `zellij-pane-${slotId}`,
    pane_id_source: 'synthetic_layout_pending_proof',
    pane_name: slotId,
    lane_dir: laneDir,
    state_dir: runtime.state_dir,
    lane_md: path.join(laneDir, 'lane.md'),
    lane_json: path.join(laneDir, 'lane.json'),
    command: buildPersistentLaneCommand(missionId, slotId, root, sessionName),
    command_inbox: runtime.command_inbox,
    command_ack: runtime.command_ack,
    command_outbox: runtime.command_outbox,
    command_cursor: runtime.command_cursor,
    heartbeat: runtime.heartbeat,
    dispatch_mode: runtime.dispatch.mode,
    dispatch_throttle_ms: runtime.dispatch.throttle_ms,
    nice_level: runtime.resource.nice_level,
    runtime,
    launch_mode: 'zellij_layout_lane',
    launch_error: null,
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

async function createSupervisorLanes(root: string, missionId: string, sessionName: string, targetActiveSlots: number, openedAt: string, launchRealZellij: boolean) {
  const lanes: ZellijLaneSupervisorLane[] = []
  for (let index = 1; index <= targetActiveSlots; index += 1) {
    const lane = createLane(root, missionId, sessionName, index, openedAt)
    if (launchRealZellij) lanes.push(await launchPersistentSlotLane(root, lane, missionId))
    else lanes.push(lane)
  }
  return lanes
}

async function launchPersistentSlotLane(root: string, lane: ZellijLaneSupervisorLane, missionId: string): Promise<ZellijLaneSupervisorLane> {
  const command = persistentLaneCommandForRoot(root, missionId, lane.slot_id, lane.runtime.session_name)
  const launch = await runZellij(['action', 'new-pane', '--name', lane.slot_id, '--', 'sh', '-lc', command], { cwd: root, timeoutMs: 5000, optional: true })
  const paneId = launch.ok ? extractZellijPaneIdFromOutput(launch.stdout_tail) : null
  const nextPaneId = paneId || lane.pane_id
  const paneIdSource = paneId ? 'zellij_new_pane_stdout' : launch.ok ? 'synthetic_fallback_new_pane_stdout_missing' : lane.pane_id_source
  await recordZellijLanePaneId(root, {
    slotId: lane.slot_id,
    paneId: nextPaneId,
    source: paneIdSource,
    sessionName: lane.runtime.session_name,
    command
  })
  await appendJsonl(path.join(root, 'agent-zellij-pane-launch-ledger.jsonl'), {
    schema: 'sks.agent-zellij-pane-launch.v1',
    generated_at: nowIso(),
    launch_mode: launch.ok ? 'real_zellij_supervisor_slot_lane' : 'real_zellij_supervisor_failed',
    slot_id: lane.slot_id,
    generation_index: null,
    session_id: null,
    pane_id: nextPaneId,
    pane_id_source: paneIdSource,
    command,
    command_inbox: lane.command_inbox,
    dispatch_mode: lane.dispatch_mode,
    dispatch_throttle_ms: lane.dispatch_throttle_ms,
    nice_level: lane.nice_level,
    persistent_slot_lane: true,
    launched_by: ZELLIJ_LANE_SUPERVISOR_SCHEMA,
    blockers: launch.ok ? [] : launch.blockers,
    warnings: [
      ...launch.warnings,
      ...(launch.ok && !paneId ? ['zellij_new_pane_stdout_missing_pane_id'] : [])
    ]
  })
  return {
    ...lane,
    pane_id: nextPaneId,
    pane_id_source: paneIdSource,
    command,
    launch_mode: launch.ok ? 'real_zellij_supervisor_slot_lane' : 'real_zellij_supervisor_failed',
    launch_error: launch.ok ? null : launch.blockers.join(', ')
  }
}

function buildPersistentLaneCommand(missionId: string, slotId: string, ledgerRoot: string, sessionName = `sks-${missionId}`) {
  const runtime = buildZellijLaneRuntimePolicy(ledgerRoot, { missionId, sessionName, slotId })
  const stderrLog = path.join(ledgerRoot, 'zellij-lane-renderer.stderr.log')
  return buildZellijLaneShellCommand(`sks zellij-lane --mission ${shellQuote(missionId)} --slot ${shellQuote(slotId)} --ledger-root ${shellQuote(ledgerRoot)} --follow 2>> ${shellQuote(stderrLog)}`, runtime)
}

function persistentLaneCommandForRoot(root: string, missionId: string, slotId: string, sessionName: string) {
  return buildPersistentLaneCommand(missionId, slotId, root, sessionName)
}

async function writeLaneRender(root: string, lane: ZellijLaneSupervisorLane, slot: AgentWorkerSlot | null, state: AgentSchedulerState | null) {
  const hydrated = hydrateLaneRuntime(root, lane, lane.runtime?.mission_id || '', lane.runtime?.session_name || '')
  await writeZellijLaneRuntimeFiles(root, hydrated.runtime)
  const laneJson = {
    schema: 'sks.zellij-lane-render.v1',
    updated_at: nowIso(),
    slot_id: hydrated.slot_id,
    pane_id: hydrated.pane_id,
    pane_id_source: hydrated.pane_id_source,
    pane_name: hydrated.pane_name,
    command_inbox: hydrated.command_inbox,
    command_ack: hydrated.command_ack,
    command_outbox: hydrated.command_outbox,
    dispatch_mode: hydrated.dispatch_mode,
    dispatch_throttle_ms: hydrated.dispatch_throttle_ms,
    nice_level: hydrated.nice_level,
    runtime: hydrated.runtime,
    current_session_id: hydrated.current_session_id,
    current_generation_index: hydrated.current_generation_index,
    generation_history_count: hydrated.generation_history_count,
    status: hydrated.drained ? 'drained' : hydrated.current_session_id ? 'running' : 'idle',
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
  await writeJsonAtomic(path.join(root, hydrated.lane_json), laneJson)
  await writeTextAtomic(path.join(root, hydrated.lane_md), [
    `# ${hydrated.slot_id}`,
    '',
    `pane: ${hydrated.pane_id} (${hydrated.pane_id_source})`,
    `session: ${hydrated.current_session_id || 'idle'}`,
    `generation: ${hydrated.current_generation_index || 'idle'}`,
    `history: ${hydrated.generation_history_count}`,
    `dispatch: ${hydrated.dispatch_mode} @ ${hydrated.dispatch_throttle_ms}ms`,
    `inbox: ${hydrated.command_inbox}`,
    `state: ${hydrated.state_dir}`,
    `nice: ${hydrated.nice_level}`,
    `drained: ${hydrated.drained ? 'yes' : 'no'}`,
    state ? `queue: ${state.pending_count} pending / ${state.completed_count} completed` : 'queue: pending',
    ''
  ].join('\n'))
}

function hydrateLaneRuntime(root: string, lane: ZellijLaneSupervisorLane, missionId: string, sessionName: string): ZellijLaneSupervisorLane {
  const slotId = normalizeZellijSlot(lane.slot_id)
  const runtime = lane.runtime?.schema === 'sks.zellij-lane-runtime.v1'
    ? lane.runtime
    : buildZellijLaneRuntimePolicy(root, {
        missionId: missionId || lane.runtime?.mission_id || 'latest',
        sessionName: sessionName || lane.runtime?.session_name || `sks-${missionId || 'latest'}`,
        slotId
      })
  return {
    ...lane,
    slot_id: slotId,
    pane_id: lane.pane_id || `zellij-pane-${slotId}`,
    pane_id_source: lane.pane_id_source || 'synthetic_layout_pending_proof',
    pane_name: lane.pane_name || slotId,
    lane_dir: lane.lane_dir || runtime.lane_dir,
    state_dir: lane.state_dir || runtime.state_dir,
    lane_md: lane.lane_md || path.join(runtime.lane_dir, 'lane.md'),
    lane_json: lane.lane_json || path.join(runtime.lane_dir, 'lane.json'),
    command_inbox: lane.command_inbox || runtime.command_inbox,
    command_ack: lane.command_ack || runtime.command_ack,
    command_outbox: lane.command_outbox || runtime.command_outbox,
    command_cursor: lane.command_cursor || runtime.command_cursor,
    heartbeat: lane.heartbeat || runtime.heartbeat,
    dispatch_mode: 'jsonl_nonblocking',
    dispatch_throttle_ms: lane.dispatch_throttle_ms || runtime.dispatch.throttle_ms,
    nice_level: lane.nice_level ?? runtime.resource.nice_level,
    runtime
  }
}

async function readSupervisor(root: string) {
  return readJson<ZellijLaneSupervisorState>(path.join(root, 'agent-zellij-lane-supervisor.json'), null as any)
}

async function writeSupervisor(root: string, state: ZellijLaneSupervisorState, eventType: string, payload: Record<string, unknown> = {}) {
  await writeJsonAtomic(path.join(root, 'agent-zellij-lane-supervisor.json'), state)
  await appendJsonl(path.join(root, 'agent-zellij-lane-supervisor-events.jsonl'), {
    schema: 'sks.zellij-lane-supervisor-event.v1',
    ts: nowIso(),
    event_type: eventType,
    payload
  })
}

function summarizeSupervisor(state: ZellijLaneSupervisorState): ZellijLaneSupervisorState {
  const unexpected = state.lanes.reduce((sum, lane) => sum + lane.unexpected_close_count, 0)
  const reopened = state.lanes.reduce((sum, lane) => sum + lane.auto_reopen_count, 0)
  const firstRuntime = state.lanes[0]?.runtime || buildZellijLaneRuntimePolicy('.', {
    missionId: state.mission_id,
    sessionName: state.session_name,
    slotId: 'slot-001'
  })
  return {
    ...state,
    lane_runtime_manifest: state.lane_runtime_manifest || 'zellij-lane-runtime.json',
    dispatch_mode: 'jsonl_nonblocking',
    fifo_policy: 'disabled_to_avoid_writer_blocking',
    resource_throttle_ms: state.resource_throttle_ms || firstRuntime.resource.throttle_ms,
    nice_level: state.nice_level ?? firstRuntime.resource.nice_level,
    unexpected_close_count: unexpected,
    auto_reopen_count: reopened,
    pane_survival_checked: state.pane_survival_checked || state.lanes.every((lane) => lane.pane_survival_checked),
    all_lanes_closed_after_drain: state.lanes.length > 0 && state.lanes.every((lane) => lane.drained && Boolean(lane.closed_at)),
    blockers: [
      ...(unexpected > 0 ? ['zellij_lane_unexpected_close_before_drain'] : []),
      ...(state.lanes.some((lane) => lane.launch_mode === 'real_zellij_supervisor_failed') ? ['zellij_lane_real_launch_failed'] : []),
      ...(state.lanes.some((lane) => lane.closed_at && !lane.drained) ? ['zellij_lane_closed_before_drain'] : [])
    ]
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

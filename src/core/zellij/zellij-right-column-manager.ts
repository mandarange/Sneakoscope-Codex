import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { openZellijDashboardPane } from './zellij-dashboard-pane.js'
import type { ZellijDashboardSnapshot } from './zellij-dashboard-renderer.js'
import type { ZellijWorkerPaneOpenInput, ZellijWorkerPaneRecord } from './zellij-worker-pane-manager.js'

export const ZELLIJ_RIGHT_COLUMN_STATE_SCHEMA = 'sks.zellij-right-column-state.v1'

export interface ZellijRightColumnState {
  schema: typeof ZELLIJ_RIGHT_COLUMN_STATE_SCHEMA
  generated_at: string
  updated_at: string
  mission_id: string
  session_name: string
  status: 'absent' | 'creating' | 'active' | 'draining' | 'closed'
  dashboard_pane_id: string | null
  right_anchor_pane_id: string | null
  visible_worker_panes: Array<{
    pane_id: string | null
    slot_id: string
    generation_index: number
    y_order: number
    status: 'launching' | 'running' | 'draining' | 'closed' | 'failed'
  }>
  headless_workers: Array<{
    slot_id: string
    generation_index: number
    reason: string
  }>
  blockers: string[]
}

export async function ensureRightColumn(input: {
  root: string
  projectRoot?: string
  missionId: string
  sessionName: string
  cwd: string
  dashboardSnapshot: Partial<ZellijDashboardSnapshot>
}): Promise<ZellijRightColumnState> {
  const paths = resolveRightColumnPaths(input.root, input.missionId, input.projectRoot)
  await ensureDir(paths.missionDir)
  const existing = await readRightColumnState(input.root, input.missionId, input.projectRoot)
  if (existing?.status === 'active' && existing.dashboard_pane_id) {
    return writeRightColumnState(paths.statePath, { ...existing, updated_at: nowIso() })
  }
  const creating = await writeRightColumnState(paths.statePath, {
    schema: ZELLIJ_RIGHT_COLUMN_STATE_SCHEMA,
    generated_at: nowIso(),
    updated_at: nowIso(),
    mission_id: input.missionId,
    session_name: input.sessionName,
    status: 'creating',
    dashboard_pane_id: null,
    right_anchor_pane_id: null,
    visible_worker_panes: [],
    headless_workers: [],
    blockers: []
  })
  await appendRightColumnEvent(paths.eventsPath, 'right_column_creating', creating, {})
  const dashboard = await openZellijDashboardPane({
    root: paths.projectRoot,
    missionId: input.missionId,
    sessionName: input.sessionName,
    cwd: input.cwd || paths.projectRoot,
    snapshot: {
      ...input.dashboardSnapshot,
      mission_id: input.missionId,
      gate_progress: input.dashboardSnapshot.gate_progress || 'right-column:first-worker'
    }
  }).catch((err: any) => ({
    ok: false,
    pane_id: null,
    blockers: [`zellij_dashboard_exception:${err?.message || String(err)}`]
  }))
  const blockers = Array.isArray((dashboard as any).blockers) ? (dashboard as any).blockers : []
  const active = await writeRightColumnState(paths.statePath, {
    ...creating,
    updated_at: nowIso(),
    status: blockers.length ? 'creating' : 'active',
    dashboard_pane_id: (dashboard as any).pane_id ? String((dashboard as any).pane_id) : null,
    right_anchor_pane_id: (dashboard as any).pane_id ? String((dashboard as any).pane_id) : null,
    blockers
  })
  await appendRightColumnEvent(paths.eventsPath, 'right_column_created', active, { ok: active.status === 'active' })
  await appendRightColumnEvent(paths.eventsPath, 'dashboard_pane_created', active, { pane_id: active.dashboard_pane_id, blockers })
  return active
}

export async function prepareWorkerInRightColumn(input: {
  root: string
  projectRoot?: string
  missionId: string
  sessionName: string
  cwd: string
  worker: Pick<ZellijWorkerPaneOpenInput, 'slotId' | 'generationIndex'>
  visiblePaneCap: number
  dashboardSnapshot: Partial<ZellijDashboardSnapshot>
}): Promise<{
  state: ZellijRightColumnState
  placement: 'zellij-pane' | 'headless'
  focusPaneId: string | null
  yOrder: number | null
}> {
  const paths = resolveRightColumnPaths(input.root, input.missionId, input.projectRoot)
  const state = await ensureRightColumn({
    root: input.root,
    ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
    missionId: input.missionId,
    sessionName: input.sessionName,
    cwd: input.cwd,
    dashboardSnapshot: input.dashboardSnapshot
  })
  const activeVisible = state.visible_worker_panes.filter((pane) => pane.status === 'launching' || pane.status === 'running')
  const cap = Math.max(1, Math.floor(Number(input.visiblePaneCap || 1)))
  if (activeVisible.length >= cap) {
    const next = await recordHeadlessWorkerInRightColumn({
      root: input.root,
      ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
      missionId: input.missionId,
      sessionName: input.sessionName,
      slotId: input.worker.slotId,
      generationIndex: input.worker.generationIndex,
      reason: `visible_pane_cap:${cap}`
    })
    return { state: next, placement: 'headless', focusPaneId: null, yOrder: null }
  }
  const lastVisible = activeVisible[activeVisible.length - 1]
  const focusPaneId = lastVisible?.pane_id || state.right_anchor_pane_id || state.dashboard_pane_id || null
  const yOrder = Math.max(1, ...state.visible_worker_panes.map((pane) => Number(pane.y_order || 0) + 1))
  const next = await writeRightColumnState(paths.statePath, {
    ...state,
    updated_at: nowIso(),
    right_anchor_pane_id: focusPaneId,
    visible_worker_panes: [
      ...state.visible_worker_panes,
      {
        pane_id: null,
        slot_id: input.worker.slotId,
        generation_index: input.worker.generationIndex,
        y_order: yOrder,
        status: 'launching'
      }
    ]
  })
  await appendRightColumnEvent(paths.eventsPath, 'scheduler_slot_reserved', next, {
    slot_id: input.worker.slotId,
    generation_index: input.worker.generationIndex,
    y_order: yOrder
  })
  return { state: next, placement: 'zellij-pane', focusPaneId, yOrder }
}

export async function recordWorkerPaneInRightColumn(input: {
  root: string
  projectRoot?: string
  missionId: string
  record: ZellijWorkerPaneRecord
  yOrder?: number | null
}) {
  const paths = resolveRightColumnPaths(input.root, input.missionId, input.projectRoot)
  const state = await readRightColumnState(input.root, input.missionId, input.projectRoot)
  if (!state) return null
  const yOrder = Math.max(1, Math.floor(Number(input.yOrder || 0))) || Math.max(1, ...state.visible_worker_panes.map((pane) => pane.y_order + 1))
  const slotId = input.record.slot_id
  const generationIndex = input.record.generation_index
  const rows = state.visible_worker_panes.filter((pane) => !(pane.slot_id === slotId && pane.generation_index === generationIndex && pane.pane_id == null))
  rows.push({
    pane_id: input.record.pane_id,
    slot_id: slotId,
    generation_index: generationIndex,
    y_order: yOrder,
    status: input.record.status === 'failed' ? 'failed' : 'running'
  })
  const next = await writeRightColumnState(paths.statePath, {
    ...state,
    updated_at: nowIso(),
    right_anchor_pane_id: input.record.pane_id || state.right_anchor_pane_id,
    visible_worker_panes: rows.sort((a, b) => a.y_order - b.y_order),
    blockers: [...new Set([...state.blockers, ...(input.record.blockers || [])])]
  })
  await appendRightColumnEvent(paths.eventsPath, 'worker_pane_created', next, {
    slot_id: slotId,
    generation_index: generationIndex,
    pane_id: input.record.pane_id,
    y_order: yOrder,
    direction_applied: input.record.direction_applied,
    blockers: input.record.blockers
  })
  return next
}

export async function recordHeadlessWorkerInRightColumn(input: {
  root: string
  projectRoot?: string
  missionId: string
  sessionName: string
  slotId: string
  generationIndex: number
  reason: string
}) {
  const paths = resolveRightColumnPaths(input.root, input.missionId, input.projectRoot)
  const state = await readRightColumnState(input.root, input.missionId, input.projectRoot) || {
    schema: ZELLIJ_RIGHT_COLUMN_STATE_SCHEMA,
    generated_at: nowIso(),
    updated_at: nowIso(),
    mission_id: input.missionId,
    session_name: input.sessionName,
    status: 'absent',
    dashboard_pane_id: null,
    right_anchor_pane_id: null,
    visible_worker_panes: [],
    headless_workers: [],
    blockers: []
  } satisfies ZellijRightColumnState
  const headless = [
    ...state.headless_workers.filter((row) => !(row.slot_id === input.slotId && row.generation_index === input.generationIndex)),
    { slot_id: input.slotId, generation_index: input.generationIndex, reason: input.reason }
  ]
  const next = await writeRightColumnState(paths.statePath, { ...state, updated_at: nowIso(), headless_workers: headless })
  await appendRightColumnEvent(paths.eventsPath, 'worker_headless_overflow', next, {
    slot_id: input.slotId,
    generation_index: input.generationIndex,
    reason: input.reason
  })
  return next
}

export async function closeWorkerInRightColumn(input: {
  root: string
  projectRoot?: string
  missionId: string
  slotId: string
  generationIndex: number
  paneId: string | null
  status: 'closed' | 'failed' | 'draining'
}) {
  const paths = resolveRightColumnPaths(input.root, input.missionId, input.projectRoot)
  const state = await readRightColumnState(input.root, input.missionId, input.projectRoot)
  if (!state) return null
  const panes = state.visible_worker_panes.map((pane) => {
    const same = pane.slot_id === input.slotId && pane.generation_index === input.generationIndex
    return same ? { ...pane, pane_id: input.paneId || pane.pane_id, status: input.status } : pane
  })
  const visibleStillActive = panes.filter((pane) => pane.status === 'launching' || pane.status === 'running')
  const next = await writeRightColumnState(paths.statePath, {
    ...state,
    updated_at: nowIso(),
    status: visibleStillActive.length || state.headless_workers.length ? 'active' : 'draining',
    right_anchor_pane_id: visibleStillActive[visibleStillActive.length - 1]?.pane_id || state.dashboard_pane_id,
    visible_worker_panes: panes
  })
  await appendRightColumnEvent(paths.eventsPath, 'worker_pane_drained', next, {
    slot_id: input.slotId,
    generation_index: input.generationIndex,
    pane_id: input.paneId,
    status: input.status
  })
  return next
}

export async function openWorkerInRightColumn(input: {
  root: string
  state: ZellijRightColumnState
  worker: ZellijWorkerPaneOpenInput
  visiblePaneCap: number
}): Promise<{ state: ZellijRightColumnState; pane: ZellijWorkerPaneRecord | null; placement: 'zellij-pane' | 'headless' }> {
  const prepared = await prepareWorkerInRightColumn({
    root: input.root,
    missionId: input.state.mission_id,
    sessionName: input.state.session_name,
    cwd: input.worker.cwd || input.root,
    worker: { slotId: input.worker.slotId, generationIndex: input.worker.generationIndex },
    visiblePaneCap: input.visiblePaneCap,
    dashboardSnapshot: { mission_id: input.state.mission_id }
  })
  return { state: prepared.state, pane: null, placement: prepared.placement }
}

export async function readRightColumnState(root: string, missionId: string, projectRoot?: string): Promise<ZellijRightColumnState | null> {
  const paths = resolveRightColumnPaths(root, missionId, projectRoot)
  return readJson<ZellijRightColumnState | null>(paths.statePath, null)
}

export function resolveRightColumnPaths(root: string, missionId: string, projectRoot?: string) {
  const resolvedRoot = path.resolve(root)
  const resolvedProjectRoot = projectRoot ? path.resolve(projectRoot) : inferProjectRoot(resolvedRoot, missionId)
  const missionDir = inferMissionDir(resolvedRoot, missionId) || path.join(resolvedProjectRoot, '.sneakoscope', 'missions', missionId)
  return {
    projectRoot: resolvedProjectRoot,
    missionDir,
    statePath: path.join(missionDir, 'zellij-right-column-state.json'),
    eventsPath: path.join(missionDir, 'zellij-right-column-events.jsonl')
  }
}

async function writeRightColumnState(file: string, state: ZellijRightColumnState): Promise<ZellijRightColumnState> {
  await writeJsonAtomic(file, state)
  return state
}

async function appendRightColumnEvent(file: string, eventType: string, state: ZellijRightColumnState, payload: Record<string, unknown>) {
  await appendJsonl(file, {
    schema: 'sks.zellij-right-column-event.v1',
    ts: nowIso(),
    event_type: eventType,
    mission_id: state.mission_id,
    session_name: state.session_name,
    ...payload
  })
}

function inferMissionDir(root: string, missionId: string): string | null {
  if (path.basename(root) === 'agents' && path.basename(path.dirname(root)) === missionId) return path.dirname(root)
  if (path.basename(root) === missionId && path.basename(path.dirname(root)) === 'missions') return root
  return null
}

function inferProjectRoot(root: string, missionId: string): string {
  if (path.basename(root) === 'agents' && path.basename(path.dirname(root)) === missionId) {
    return path.dirname(path.dirname(path.dirname(path.dirname(root))))
  }
  if (path.basename(root) === missionId && path.basename(path.dirname(root)) === 'missions') {
    return path.dirname(path.dirname(path.dirname(root)))
  }
  return root
}

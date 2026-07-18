import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import type { ZellijWorkerPaneOpenInput, ZellijWorkerPaneRecord } from './zellij-worker-pane-manager.js'
import type { SksZellijUiMode } from './zellij-ui-mode.js'

export const ZELLIJ_RIGHT_COLUMN_STATE_SCHEMA = 'sks.zellij-right-column-state.v1'

export interface ZellijRightColumnState {
  schema: typeof ZELLIJ_RIGHT_COLUMN_STATE_SCHEMA
  generated_at: string
  updated_at: string
  mission_id: string
  session_name: string
  status: 'absent' | 'creating' | 'active' | 'draining' | 'closed'
  right_anchor_pane_id: string | null
  slot_column_anchor_pane_id: string | null
  ui_mode: SksZellijUiMode
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
    status?: 'running' | 'closed' | 'failed'
    closed_at?: string | null
  }>
  blockers: string[]
}

export async function ensureRightColumn(input: {
  root: string
  projectRoot?: string
  missionId: string
  sessionName: string
  uiMode?: SksZellijUiMode
}): Promise<ZellijRightColumnState> {
  const paths = resolveRightColumnPaths(input.root, input.missionId, input.projectRoot)
  await ensureDir(paths.missionDir)
  const uiMode = input.uiMode || 'compact-slots'
  const existing = await readRightColumnState(input.root, input.missionId, input.projectRoot)
  if (existing?.status === 'active') {
    return writeRightColumnState(paths.statePath, {
      ...existing,
      updated_at: nowIso(),
      slot_column_anchor_pane_id: existing.slot_column_anchor_pane_id || null,
      ui_mode: existing.ui_mode || uiMode
    })
  }
  const creating = await writeRightColumnState(paths.statePath, {
    schema: ZELLIJ_RIGHT_COLUMN_STATE_SCHEMA,
    generated_at: nowIso(),
    updated_at: nowIso(),
    mission_id: input.missionId,
    session_name: input.sessionName,
    status: 'creating',
    right_anchor_pane_id: null,
    slot_column_anchor_pane_id: null,
    ui_mode: uiMode,
    visible_worker_panes: [],
    headless_workers: [],
    blockers: []
  })
  await appendRightColumnEvent(paths.eventsPath, 'right_column_creating', creating, {})
  const active = await writeRightColumnState(paths.statePath, {
    ...creating,
    updated_at: nowIso(),
    status: 'active',
    blockers: []
  })
  await appendRightColumnEvent(paths.eventsPath, 'right_column_created', active, { ok: true, ui_mode: uiMode })
  return active
}

export async function prepareWorkerInRightColumn(input: {
  root: string
  projectRoot?: string
  missionId: string
  sessionName: string
  worker: Pick<ZellijWorkerPaneOpenInput, 'slotId' | 'generationIndex'>
  visiblePaneCap: number
  uiMode?: SksZellijUiMode
}): Promise<{
  state: ZellijRightColumnState
  placement: 'zellij-pane' | 'headless'
  focusPaneId: string | null
  yOrder: number | null
}> {
  return withRightColumnLock(input.root, input.missionId, async () => prepareWorkerInRightColumnUnlocked(input))
}

async function prepareWorkerInRightColumnUnlocked(input: {
  root: string
  projectRoot?: string
  missionId: string
  sessionName: string
  worker: Pick<ZellijWorkerPaneOpenInput, 'slotId' | 'generationIndex'>
  visiblePaneCap: number
  uiMode?: SksZellijUiMode
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
    uiMode: input.uiMode || 'compact-slots'
  })
  const activeVisible = state.visible_worker_panes.filter((pane) => pane.status === 'launching' || pane.status === 'running')
  const cap = Math.max(1, Math.floor(Number(input.visiblePaneCap || 1)))
  if (activeVisible.length >= cap) {
    const next = await recordHeadlessWorkerInRightColumnUnlocked({
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
  const focusPaneId = lastVisible?.pane_id || state.slot_column_anchor_pane_id || state.right_anchor_pane_id || null
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
  return withRightColumnLock(input.root, input.missionId, async () => recordWorkerPaneInRightColumnUnlocked(input))
}

async function recordWorkerPaneInRightColumnUnlocked(input: {
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
    slot_column_anchor_pane_id: input.record.slot_column_anchor_pane_id || state.slot_column_anchor_pane_id || null,
    visible_worker_panes: rows.sort((a, b) => a.y_order - b.y_order),
    blockers: [...new Set([...state.blockers, ...(input.record.blockers || [])])]
  })
  await appendRightColumnEvent(paths.eventsPath, 'worker_pane_created', next, {
    slot_id: slotId,
    generation_index: generationIndex,
    pane_id: input.record.pane_id,
    y_order: yOrder,
    direction_applied: input.record.direction_applied,
    column_creation_direction_requested: input.record.column_creation_direction_requested || null,
    column_creation_direction_applied: input.record.column_creation_direction_applied || null,
    worker_direction_requested: input.record.worker_direction_requested,
    worker_direction_applied: input.record.worker_direction_applied,
    slot_column_anchor_pane_id: input.record.slot_column_anchor_pane_id || state.slot_column_anchor_pane_id || null,
    blockers: input.record.blockers
  })
  return next
}

export async function recordSlotColumnAnchorInRightColumn(input: {
  root: string
  projectRoot?: string
  missionId: string
  sessionName: string
  paneId: string | null
}) {
  return withRightColumnLock(input.root, input.missionId, async () => recordSlotColumnAnchorInRightColumnUnlocked(input))
}

async function recordSlotColumnAnchorInRightColumnUnlocked(input: {
  root: string
  projectRoot?: string
  missionId: string
  sessionName: string
  paneId: string | null
}) {
  const paths = resolveRightColumnPaths(input.root, input.missionId, input.projectRoot)
  const state = await readRightColumnState(input.root, input.missionId, input.projectRoot) || {
    schema: ZELLIJ_RIGHT_COLUMN_STATE_SCHEMA,
    generated_at: nowIso(),
    updated_at: nowIso(),
    mission_id: input.missionId,
    session_name: input.sessionName,
    status: 'active',
    right_anchor_pane_id: null,
    slot_column_anchor_pane_id: null,
    ui_mode: 'compact-slots',
    visible_worker_panes: [],
    headless_workers: [],
    blockers: []
  } satisfies ZellijRightColumnState
  const paneId = input.paneId ? String(input.paneId) : null
  const next = await writeRightColumnState(paths.statePath, {
    ...state,
    updated_at: nowIso(),
    status: 'active',
    session_name: input.sessionName || state.session_name,
    right_anchor_pane_id: paneId || state.right_anchor_pane_id,
    slot_column_anchor_pane_id: paneId || state.slot_column_anchor_pane_id
  })
  await appendRightColumnEvent(paths.eventsPath, 'slot_column_anchor_created', next, {
    pane_id: paneId,
    column_creation_direction_requested: 'right',
    column_creation_direction_applied: paneId ? 'right' : 'unknown'
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
  return withRightColumnLock(input.root, input.missionId, async () => recordHeadlessWorkerInRightColumnUnlocked(input))
}

async function recordHeadlessWorkerInRightColumnUnlocked(input: {
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
    right_anchor_pane_id: null,
    slot_column_anchor_pane_id: null,
    ui_mode: 'compact-slots',
    visible_worker_panes: [],
    headless_workers: [],
    blockers: []
  } satisfies ZellijRightColumnState
  const headless = [
    ...state.headless_workers.filter((row) => !(row.slot_id === input.slotId && row.generation_index === input.generationIndex)),
    { slot_id: input.slotId, generation_index: input.generationIndex, reason: input.reason, status: 'running' as const, closed_at: null }
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
  return withRightColumnLock(input.root, input.missionId, async () => closeWorkerInRightColumnUnlocked(input))
}

async function closeWorkerInRightColumnUnlocked(input: {
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
  const headless = state.headless_workers.map((row) => {
    const same = row.slot_id === input.slotId && row.generation_index === input.generationIndex
    return same ? { ...row, status: input.status === 'draining' ? 'closed' as const : input.status, closed_at: nowIso() } : row
  })
  const visibleStillActive = panes.filter((pane) => pane.status === 'launching' || pane.status === 'running')
  const headlessStillActive = headless.filter((row) => !row.status || row.status === 'running')
  const next = await writeRightColumnState(paths.statePath, {
    ...state,
    updated_at: nowIso(),
    status: visibleStillActive.length || headlessStillActive.length ? 'active' : 'draining',
    right_anchor_pane_id: visibleStillActive[visibleStillActive.length - 1]?.pane_id || state.slot_column_anchor_pane_id,
    visible_worker_panes: panes,
    headless_workers: headless
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
    worker: { slotId: input.worker.slotId, generationIndex: input.worker.generationIndex },
    visiblePaneCap: input.visiblePaneCap
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

const rightColumnLocks = new Map<string, Promise<unknown>>()

async function withRightColumnLock<T>(root: string, missionId: string, fn: () => Promise<T>): Promise<T> {
  const key = `${path.resolve(root)}:${missionId}`
  const previous = rightColumnLocks.get(key) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const chained = previous.then(() => current, () => current)
  rightColumnLocks.set(key, chained)
  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
    if (rightColumnLocks.get(key) === chained) rightColumnLocks.delete(key)
  }
}

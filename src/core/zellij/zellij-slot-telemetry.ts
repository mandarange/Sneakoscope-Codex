import path from 'node:path'
import { appendJsonlBounded, ensureDir, nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'

export const ZELLIJ_SLOT_TELEMETRY_EVENT_SCHEMA = 'sks.zellij-slot-telemetry-event.v1'
export const ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA = 'sks.zellij-slot-telemetry-snapshot.v1'

export type ZellijSlotTelemetryEventType =
  | 'slot_reserved'
  | 'worker_spawned'
  | 'heartbeat'
  | 'task_started'
  | 'task_progress'
  | 'artifact_written'
  | 'patch_candidate'
  | 'verification_started'
  | 'verification_passed'
  | 'verification_failed'
  | 'worker_completed'
  | 'worker_failed'
  | 'headless_overflow'

export type ZellijSlotTelemetryStatus =
  | 'queued'
  | 'launching'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'headless'
  | 'drained'

export interface ZellijSlotTelemetryEvent {
  schema: typeof ZELLIJ_SLOT_TELEMETRY_EVENT_SCHEMA
  ts: string
  mission_id: string
  slot_id: string
  generation_index: number
  worker_id: string
  event_type: ZellijSlotTelemetryEventType
  status: ZellijSlotTelemetryStatus
  role?: string
  backend?: string
  provider?: string
  service_tier?: string
  worktree_id?: string | null
  worktree_path?: string | null
  task_title?: string
  current_file?: string | null
  progress?: {
    done: number
    total: number
    label: string
  }
  artifact_paths?: string[]
  log_tail?: string
  blockers?: string[]
}

export interface ZellijSlotTelemetrySnapshot {
  schema: typeof ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA
  mission_id: string
  updated_at: string
  slots: Record<string, {
    slot_id: string
    generation_index: number
    worker_id: string
    status: string
    role: string
    backend: string
    provider: string
    service_tier: string
    worktree_id: string | null
    worktree_path: string | null
    task_title: string
    current_file: string | null
    latest_event_type: string
    latest_ts: string
    progress: { done: number; total: number; label: string } | null
    artifact_paths: string[]
    blockers: string[]
    log_tail: string
  }>
  counts: {
    queued: number
    running: number
    verifying: number
    completed: number
    failed: number
    headless: number
  }
}

export function slotTelemetryEventPath(root: string, missionId: string) {
  return path.join(inferMissionDir(root, missionId), 'zellij', 'slot-telemetry.events.jsonl')
}

export function slotTelemetrySnapshotPath(root: string, missionId: string) {
  return path.join(inferMissionDir(root, missionId), 'zellij', 'slot-telemetry.snapshot.json')
}

export async function appendZellijSlotTelemetry(root: string, event: ZellijSlotTelemetryEvent): Promise<void> {
  const missionId = String(event?.mission_id || '').trim()
  if (!missionId) throw new Error('mission_id required for Zellij slot telemetry')
  const normalized = normalizeTelemetryEvent(event)
  const file = slotTelemetryEventPath(root, missionId)
  await ensureDir(path.dirname(file))
  await appendJsonlBounded(file, normalized)
  await rebuildZellijSlotTelemetrySnapshot(root, missionId)
}

export async function readZellijSlotTelemetrySnapshot(root: string, missionId: string): Promise<ZellijSlotTelemetrySnapshot> {
  const existing = await readJson(slotTelemetrySnapshotPath(root, missionId), null)
  if (existing?.schema === ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA) return existing as ZellijSlotTelemetrySnapshot
  return rebuildZellijSlotTelemetrySnapshot(root, missionId)
}

export async function rebuildZellijSlotTelemetrySnapshot(root: string, missionId: string): Promise<ZellijSlotTelemetrySnapshot> {
  const eventsPath = slotTelemetryEventPath(root, missionId)
  const rows = await readTelemetryEvents(eventsPath)
  const slots: ZellijSlotTelemetrySnapshot['slots'] = {}
  for (const row of rows) {
    if (row.mission_id !== missionId) continue
    const key = slotTelemetryKey(row.slot_id || row.worker_id, row.generation_index)
    const previous = slots[key]
    slots[key] = mergeSlotTelemetry(previous, row)
  }
  const snapshot: ZellijSlotTelemetrySnapshot = {
    schema: ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA,
    mission_id: missionId,
    updated_at: nowIso(),
    slots,
    counts: countSlotTelemetry(slots)
  }
  await writeJsonAtomic(slotTelemetrySnapshotPath(root, missionId), snapshot)
  return snapshot
}

async function readTelemetryEvents(file: string): Promise<ZellijSlotTelemetryEvent[]> {
  const text = await readText(file, '')
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return normalizeTelemetryEvent(JSON.parse(line))
      } catch {
        return null
      }
    })
    .filter((row): row is ZellijSlotTelemetryEvent => Boolean(row))
}

function normalizeTelemetryEvent(event: ZellijSlotTelemetryEvent): ZellijSlotTelemetryEvent {
  const status = normalizeStatus(event.status)
  return {
    schema: ZELLIJ_SLOT_TELEMETRY_EVENT_SCHEMA,
    ts: event.ts || nowIso(),
    mission_id: String(event.mission_id || ''),
    slot_id: String(event.slot_id || event.worker_id || 'slot-001'),
    generation_index: Math.max(1, Math.floor(Number(event.generation_index) || 1)),
    worker_id: String(event.worker_id || event.slot_id || 'worker'),
    event_type: normalizeEventType(event.event_type),
    status,
    ...(event.role ? { role: String(event.role) } : {}),
    ...(event.backend ? { backend: String(event.backend) } : {}),
    ...(event.provider ? { provider: String(event.provider) } : {}),
    ...(event.service_tier ? { service_tier: String(event.service_tier) } : {}),
    worktree_id: event.worktree_id == null ? null : String(event.worktree_id),
    worktree_path: event.worktree_path == null ? null : String(event.worktree_path),
    ...(event.task_title ? { task_title: String(event.task_title) } : {}),
    current_file: event.current_file == null ? null : String(event.current_file),
    ...(event.progress ? { progress: normalizeProgress(event.progress) } : {}),
    ...(Array.isArray(event.artifact_paths) ? { artifact_paths: event.artifact_paths.map(String).filter(Boolean) } : {}),
    ...(event.log_tail ? { log_tail: tail(event.log_tail, 1200) } : {}),
    ...(Array.isArray(event.blockers) ? { blockers: event.blockers.map(String).filter(Boolean) } : {})
  }
}

function mergeSlotTelemetry(previous: ZellijSlotTelemetrySnapshot['slots'][string] | undefined, event: ZellijSlotTelemetryEvent): ZellijSlotTelemetrySnapshot['slots'][string] {
  return {
    slot_id: event.slot_id,
    generation_index: event.generation_index,
    worker_id: event.worker_id,
    status: event.status,
    role: event.role || previous?.role || 'worker',
    backend: event.backend || previous?.backend || 'unknown',
    provider: event.provider || previous?.provider || 'unknown',
    service_tier: event.service_tier || previous?.service_tier || 'unknown',
    worktree_id: event.worktree_id ?? previous?.worktree_id ?? null,
    worktree_path: event.worktree_path ?? previous?.worktree_path ?? null,
    task_title: event.task_title || previous?.task_title || 'waiting for task',
    current_file: event.current_file ?? previous?.current_file ?? null,
    latest_event_type: event.event_type,
    latest_ts: event.ts,
    progress: event.progress || previous?.progress || null,
    artifact_paths: unique([...(previous?.artifact_paths || []), ...(event.artifact_paths || [])]),
    blockers: unique([...(previous?.blockers || []), ...(event.blockers || [])]),
    log_tail: event.log_tail || previous?.log_tail || ''
  }
}

function countSlotTelemetry(slots: ZellijSlotTelemetrySnapshot['slots']): ZellijSlotTelemetrySnapshot['counts'] {
  const counts = { queued: 0, running: 0, verifying: 0, completed: 0, failed: 0, headless: 0 }
  for (const row of Object.values(slots)) {
    const status = normalizeStatus(row.status)
    if (status === 'queued' || status === 'launching') counts.queued += 1
    else if (status === 'running') counts.running += 1
    else if (status === 'verifying') counts.verifying += 1
    else if (status === 'completed' || status === 'drained') counts.completed += 1
    else if (status === 'failed') counts.failed += 1
    else if (status === 'headless') counts.headless += 1
  }
  return counts
}

function normalizeStatus(value: unknown): ZellijSlotTelemetryStatus {
  const text = String(value || '').toLowerCase()
  if (text === 'closed' || text === 'done' || text === 'passed') return 'completed'
  if (text === 'blocked' || text === 'error') return 'failed'
  if (text === 'coding') return 'running'
  if (['queued', 'launching', 'running', 'verifying', 'completed', 'failed', 'headless', 'drained'].includes(text)) return text as ZellijSlotTelemetryStatus
  return 'running'
}

function normalizeEventType(value: unknown): ZellijSlotTelemetryEventType {
  const text = String(value || '')
  const allowed = new Set([
    'slot_reserved', 'worker_spawned', 'heartbeat', 'task_started', 'task_progress',
    'artifact_written', 'patch_candidate', 'verification_started', 'verification_passed',
    'verification_failed', 'worker_completed', 'worker_failed', 'headless_overflow'
  ])
  return allowed.has(text) ? text as ZellijSlotTelemetryEventType : 'heartbeat'
}

function normalizeProgress(value: any) {
  return {
    done: Math.max(0, Math.floor(Number(value?.done) || 0)),
    total: Math.max(0, Math.floor(Number(value?.total) || 0)),
    label: String(value?.label || 'progress')
  }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function slotTelemetryKey(slotId: unknown, generationIndex: unknown) {
  const slot = String(slotId || 'slot-001').trim() || 'slot-001'
  const generation = Math.max(1, Math.floor(Number(generationIndex) || 1))
  return `${slot}:g${generation}`
}

function tail(value: unknown, max: number) {
  const text = String(value || '').replace(/\s+$/g, '')
  return text.length > max ? text.slice(-max) : text
}

function inferMissionDir(root: string, missionId: string) {
  const resolved = path.resolve(root)
  if (path.basename(resolved) === 'agents' && path.basename(path.dirname(resolved)) === missionId) return path.dirname(resolved)
  if (path.basename(resolved) === missionId && path.basename(path.dirname(resolved)) === 'missions') return resolved
  const marker = `${path.sep}.sneakoscope${path.sep}missions${path.sep}${missionId}${path.sep}`
  const index = resolved.indexOf(marker)
  if (index >= 0) return resolved.slice(0, index + marker.length - 1)
  return path.join(resolved, '.sneakoscope', 'missions', missionId)
}

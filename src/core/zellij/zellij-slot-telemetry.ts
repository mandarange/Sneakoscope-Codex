import path from 'node:path'
import fsp from 'node:fs/promises'
import { appendJsonlBounded, ensureDir, nowIso, readJson, readText } from '../fsx.js'

export const ZELLIJ_SLOT_TELEMETRY_EVENT_SCHEMA = 'sks.zellij-slot-telemetry-event.v1'
export const ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA = 'sks.zellij-slot-telemetry-snapshot.v1'
const telemetrySnapshotCache = new Map<string, ZellijSlotTelemetrySnapshot>()
const telemetrySnapshotWriteCounts = new Map<string, number>()
const telemetrySnapshotFlushCounts = new Map<string, number>()
const telemetrySnapshotLastFlushMs = new Map<string, number>()
const telemetrySnapshotDiskStat = new Map<string, { mtimeMs: number; size: number }>()

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
  flush_count?: number
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
  const previous = await readZellijSlotTelemetrySnapshotNoRebuild(root, missionId)
  if (previous) {
    const snapshotPath = slotTelemetrySnapshotPath(root, missionId)
    const next = applyTelemetryEventToSnapshot(previous, normalized)
    telemetrySnapshotCache.set(snapshotPath, next)
    if (shouldFlushTelemetrySnapshot(snapshotPath, normalized)) await writeTelemetrySnapshotFast(snapshotPath, next)
    return
  }
  await rebuildZellijSlotTelemetrySnapshot(root, missionId)
}

export async function readZellijSlotTelemetrySnapshot(root: string, missionId: string): Promise<ZellijSlotTelemetrySnapshot> {
  const fresh = await readZellijSlotTelemetrySnapshotNoRebuild(root, missionId)
  if (fresh) return fresh
  return rebuildZellijSlotTelemetrySnapshot(root, missionId)
}

export async function readZellijSlotTelemetrySnapshotNoRebuild(root: string, missionId: string): Promise<ZellijSlotTelemetrySnapshot | null> {
  const snapshotPath = slotTelemetrySnapshotPath(root, missionId)
  const cached = telemetrySnapshotCache.get(snapshotPath)
  const stat = await statTelemetryFile(snapshotPath)
  const recorded = telemetrySnapshotDiskStat.get(snapshotPath)
  const diskChanged = Boolean(stat) && (!recorded || recorded.mtimeMs !== stat!.mtimeMs || recorded.size !== stat!.size)
  // CRITICAL: never serve a process-local cache forever. Long-lived reader
  // processes (zellij slot pane renderers in --watch mode) must observe
  // snapshot flushes performed by the orchestrator and worker processes,
  // otherwise the pane renders the same frame for the entire mission.
  if (!diskChanged && cached?.schema === ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA) return cached
  const existing = await readJson(snapshotPath, null)
  if (stat) telemetrySnapshotDiskStat.set(snapshotPath, stat)
  if (existing?.schema !== ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA) {
    return cached?.schema === ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA ? cached : null
  }
  const disk = existing as ZellijSlotTelemetrySnapshot
  // Merge with any locally cached (possibly not-yet-flushed) slot state so a
  // writer process does not lose its pending events when another process
  // flushed the snapshot file in the meantime. The DISK updated_at stays
  // authoritative on the read path: it reflects the last real flush, which is
  // what stale-telemetry detection must measure.
  const merged = cached?.schema === ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA ? mergeTelemetrySnapshots(disk, cached, { updatedAt: 'base' }) : disk
  telemetrySnapshotCache.set(snapshotPath, merged)
  return merged
}

export function mergeTelemetrySnapshots(base: ZellijSlotTelemetrySnapshot, overlay: ZellijSlotTelemetrySnapshot, opts: { updatedAt?: 'base' | 'latest' } = {}): ZellijSlotTelemetrySnapshot {
  const slots: ZellijSlotTelemetrySnapshot['slots'] = { ...(base.slots || {}) }
  for (const [key, row] of Object.entries(overlay.slots || {})) {
    const existing = slots[key]
    slots[key] = !existing || telemetryTsMs(row.latest_ts) >= telemetryTsMs(existing.latest_ts) ? row : existing
  }
  const baseTs = Date.parse(String(base.updated_at || '')) || 0
  const overlayTs = Date.parse(String(overlay.updated_at || '')) || 0
  return {
    schema: ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA,
    mission_id: base.mission_id || overlay.mission_id,
    updated_at: opts.updatedAt === 'base' ? base.updated_at : overlayTs > baseTs ? overlay.updated_at : base.updated_at,
    flush_count: Math.max(Number(base.flush_count || 0), Number(overlay.flush_count || 0)),
    slots,
    counts: countSlotTelemetry(slots)
  }
}

function telemetryTsMs(value: unknown): number {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

async function statTelemetryFile(file: string): Promise<{ mtimeMs: number; size: number } | null> {
  try {
    const st = await fsp.stat(file)
    return { mtimeMs: st.mtimeMs, size: st.size }
  } catch {
    return null
  }
}

export function applyTelemetryEventToSnapshot(snapshot: ZellijSlotTelemetrySnapshot, event: ZellijSlotTelemetryEvent): ZellijSlotTelemetrySnapshot {
  const key = slotTelemetryKey(event.slot_id || event.worker_id, event.generation_index)
  const slots = {
    ...(snapshot.slots || {}),
    [key]: mergeSlotTelemetry(snapshot.slots?.[key], event)
  }
  return {
    schema: ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA,
    mission_id: event.mission_id || snapshot.mission_id,
    updated_at: nowIso(),
    flush_count: snapshot.flush_count || 0,
    slots,
    counts: countSlotTelemetry(slots)
  }
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
    flush_count: 0,
    slots,
    counts: countSlotTelemetry(slots)
  }
  await writeTelemetrySnapshotFast(slotTelemetrySnapshotPath(root, missionId), snapshot)
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

async function writeTelemetrySnapshotFast(file: string, snapshot: ZellijSlotTelemetrySnapshot) {
  await ensureDir(path.dirname(file))
  const flushCount = Number(telemetrySnapshotFlushCounts.get(file) || 0) + 1
  telemetrySnapshotFlushCounts.set(file, flushCount)
  telemetrySnapshotLastFlushMs.set(file, Date.now())
  // Merge with the on-disk snapshot before overwriting: multiple processes
  // (orchestrator + worker children) flush this file concurrently and a plain
  // overwrite would drop slots that only the other process has observed.
  const disk = await readJson(file, null) as ZellijSlotTelemetrySnapshot | null
  const merged = disk?.schema === ZELLIJ_SLOT_TELEMETRY_SNAPSHOT_SCHEMA ? mergeTelemetrySnapshots(disk, snapshot) : snapshot
  const next = { ...merged, flush_count: Math.max(flushCount, Number(merged.flush_count || 0)) }
  telemetrySnapshotCache.set(file, next)
  await fsp.writeFile(file, `${JSON.stringify(next)}\n`, 'utf8')
  const stat = await statTelemetryFile(file)
  if (stat) telemetrySnapshotDiskStat.set(file, stat)
}

function shouldFlushTelemetrySnapshot(file: string, event: ZellijSlotTelemetryEvent) {
  const next = (telemetrySnapshotWriteCounts.get(file) || 0) + 1
  telemetrySnapshotWriteCounts.set(file, next)
  const now = Date.now()
  const last = telemetrySnapshotLastFlushMs.get(file) || 0
  const parsedFlushMs = Number(process.env.SKS_ZELLIJ_SLOT_TELEMETRY_FLUSH_MS || 1000)
  const parsedFlushEvery = Number(process.env.SKS_ZELLIJ_SLOT_TELEMETRY_FLUSH_EVERY_N || 100)
  const flushMs = Math.max(250, Number.isFinite(parsedFlushMs) ? parsedFlushMs : 1000)
  const flushEvery = Math.max(1, Number.isFinite(parsedFlushEvery) ? Math.floor(parsedFlushEvery) : 100)
  const important =
    event.event_type === 'task_started'
    || event.event_type === 'task_progress'
    || event.event_type === 'artifact_written'
    || event.event_type === 'patch_candidate'
    || event.event_type === 'worker_completed'
    || event.event_type === 'worker_failed'
    || event.status === 'completed'
    || event.status === 'failed'
  const should =
    next === 1
    || important
    || now - last >= flushMs
    || next % flushEvery === 0
  if (should) telemetrySnapshotLastFlushMs.set(file, now)
  return should
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

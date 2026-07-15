import fs from 'node:fs'
import path from 'node:path'
import { packageRoot } from '../fsx.js'
import { readZellijSlotTelemetrySnapshot } from './zellij-slot-telemetry.js'
import { workerBackendTag } from './zellij-worker-pane-manager.js'

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf8'))
    return String(pkg?.version || '?')
  } catch {
    return '?'
  }
}

export interface ZellijSlotColumnAnchorInput {
  activeWorkers?: number
  visiblePaneCap?: number
  headlessWorkers?: number
  queueDepth?: number
  completedWorkers?: number
  failedWorkers?: number
  updateAvailableVersion?: string | null
  madSksSqlPlaneActive?: boolean
  qaAppHandoffPending?: boolean
  qaAppHandoffArtifact?: string | null
  loopsTotal?: number
  loopsRunning?: number
  loopsBlocked?: number
  loopsCompleted?: number
  mode?: string
  workerRows?: ZellijSlotColumnWorkerRow[]
  maxWorkerRows?: number
}

export interface ZellijSlotColumnWorkerRow {
  slotId: string
  generationIndex?: number | null
  placement?: 'zellij-pane' | 'headless' | 'process' | string | null
  status?: string | null
  backend?: string | null
  role?: string | null
  task?: string | null
  worktreeId?: string | null
  paneId?: string | null
  reason?: string | null
  heartbeatAgeMs?: number | null
}

export function renderZellijSlotColumnAnchor(input: ZellijSlotColumnAnchorInput = {}): string {
  const active = nonNegativeInt(input.activeWorkers, 0)
  const visible = Math.max(1, nonNegativeInt(input.visiblePaneCap, active || 1))
  const headless = nonNegativeInt(input.headlessWorkers, 0)
  const queue = nonNegativeInt(input.queueDepth, 0)
  const done = nonNegativeInt(input.completedWorkers, 0)
  const fail = nonNegativeInt(input.failedWorkers, 0)
  const update = input.updateAvailableVersion ? ` · update ${trimInline(input.updateAvailableVersion, 18)} available` : ''
  const sqlPlane = input.madSksSqlPlaneActive ? ' · MAD-SKS SQL-PLANE ACTIVE' : ''
  const appHandoff = input.qaAppHandoffPending ? ' · QA /app handoff pending' : ''
  const loopHeader = input.loopsTotal != null
    ? `LOOPS ${nonNegativeInt(input.loopsTotal, 0)} · running ${nonNegativeInt(input.loopsRunning, 0)} · blocked ${nonNegativeInt(input.loopsBlocked, 0)} · done ${nonNegativeInt(input.loopsCompleted, 0)} · workers ${active}`
    : null
  const header = loopHeader || (done || fail
    ? `SLOTS active ${active} · headless ${headless} · done ${done} · fail ${fail} · q ${queue}${update}${sqlPlane}${appHandoff}`
    : `SLOTS active ${active}/${visible} · headless ${headless} · q ${queue}${update}${sqlPlane}${appHandoff}`)
  const workers = Array.isArray(input.workerRows) ? input.workerRows : []
  const handoffLine = input.qaAppHandoffPending ? `QA app handoff pending · ${trimInline(input.qaAppHandoffArtifact || 'qa-loop/app-handoff.json', 64)}` : null
  if (!workers.length) return [header, handoffLine, 'visible slot panes stack below this anchor'].filter(Boolean).join('\n')
  const maxRows = Math.max(1, nonNegativeInt(input.maxWorkerRows, input.mode === 'full-debug' ? 24 : 12))
  const overflowRows = workers.filter((row) => row.placement === 'headless').slice(0, maxRows)
  const visibleRows = overflowRows.length ? overflowRows : workers.filter((row) => row.placement !== 'zellij-pane').slice(0, maxRows)
  const hidden = Math.max(0, workers.length - visibleRows.length)
  return [
    header,
    handoffLine,
    `visible slot panes stack below this anchor`,
    ...visibleRows.map((row, index) => renderWorkerRow(row, index + 1)),
    ...(hidden && visibleRows.length ? [`+${hidden} worker${hidden === 1 ? '' : 's'} in dedicated panes or overflow`] : [])
  ].join('\n')
}

export async function renderZellijSlotColumnAnchorFromArtifacts(input: {
  artifactRoot: string
  missionId: string
  mode?: string
}): Promise<string> {
  const root = path.resolve(input.artifactRoot)
  const missionDir = inferMissionDir(root, input.missionId)
  const telemetry = await readZellijSlotTelemetrySnapshot(root, input.missionId).catch(() => null)
  const updateNotice = await readJson(path.join(missionDir, 'update-notice.json'))
  const sqlPlaneCapability = await readJson(path.join(missionDir, 'mad-sks', 'sql-plane', 'capability.json'))
  const appHandoff = await readJson(path.join(missionDir, 'qa-loop', 'app-handoff.json'))
  if (telemetry && Object.keys(telemetry.slots || {}).length) {
    return renderTelemetryAnchor(telemetry, updateNotice, sqlPlaneCapability, appHandoff)
  }
  const snapshot = await readJson(path.join(missionDir, 'zellij-dashboard-snapshot.json'))
  const rightColumn = await readJson(path.join(missionDir, 'zellij-right-column-state.json'))
  const runtime = await readJson(path.join(root, 'native-cli-worker-runtime.json'))
    || await readJson(path.join(missionDir, 'agents', 'native-cli-worker-runtime.json'))
  const workerRows = await buildWorkerRows(root, missionDir, rightColumn, runtime)
  const activeWorkers = Number(snapshot?.active_workers ?? workerRows.filter((row) => row.status === 'running' || row.status === 'launching').length ?? 0)
  const visiblePaneCap = Number(snapshot?.visible_panes ?? Math.max(1, rightColumn?.visible_worker_panes?.length || activeWorkers || 1))
  const headlessWorkers = Number(snapshot?.headless_workers ?? workerRows.filter((row) => row.placement === 'headless' && (!row.status || row.status === 'running')).length ?? 0)
  const queueDepth = Number(snapshot?.queue_depth ?? 0)
  const anchorInput: ZellijSlotColumnAnchorInput = { activeWorkers, visiblePaneCap, headlessWorkers, queueDepth, workerRows }
  if (updateNotice?.update_available && updateNotice.latest_version) anchorInput.updateAvailableVersion = String(updateNotice.latest_version)
  if (isMadSksSqlPlaneActive(sqlPlaneCapability)) anchorInput.madSksSqlPlaneActive = true
  if (['pending', 'blocked_for_desktop_review'].includes(String(appHandoff?.status || ''))) {
    anchorInput.qaAppHandoffPending = true
    anchorInput.qaAppHandoffArtifact = appHandoff?.artifact_path || 'qa-loop/app-handoff.json'
  }
  if (input.mode !== undefined) anchorInput.mode = input.mode
  return renderZellijSlotColumnAnchor(anchorInput)
}

function renderTelemetryAnchor(snapshot: any, updateNotice: any = null, sqlPlaneCapability: any = null, appHandoff: any = null): string {
  const updatedAt = Date.parse(snapshot.updated_at || '')
  const staleSeconds = Number.isFinite(updatedAt) ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null
  const counts = snapshot.counts || {}
  const active = Number(counts.running || 0) + Number(counts.verifying || 0)
  const update = updateNotice?.update_available && updateNotice?.latest_version ? ` · update ${trimInline(String(updateNotice.latest_version), 18)} available` : ''
  const sqlPlane = isMadSksSqlPlaneActive(sqlPlaneCapability) ? ' · MAD-SKS SQL-PLANE ACTIVE' : ''
  const qaHandoff = ['pending', 'blocked_for_desktop_review'].includes(String(appHandoff?.status || '')) ? ' · QA /app handoff pending' : ''
  // Compact SKS branding header: package version + mission id so the SLOTS column self-identifies.
  const brand = `SKS v${readPackageVersion()} · mission ${trimInline(String(snapshot.mission_id || '-'), 28)}`
  if (staleSeconds != null && staleSeconds > 60) {
    return [brand, `SLOTS telemetry stale ${staleSeconds}s · active ?${update}${sqlPlane}${qaHandoff}`].join('\n')
  }
  const countsLine = `SLOTS active ${active} · run ${Number(counts.running || 0)} · verify ${Number(counts.verifying || 0)} · headless ${Number(counts.headless || 0)} · done ${Number(counts.completed || 0)} · fail ${Number(counts.failed || 0)} · q ${Number(counts.queued || 0)}${update}${sqlPlane}${qaHandoff}`
  const slotRows = renderTelemetrySlotRows(snapshot)
  return [brand, countsLine, ...slotRows].join('\n')
}

function renderTelemetrySlotRows(snapshot: any): string[] {
  const slots = Object.values((snapshot?.slots || {}) as Record<string, any>)
  if (!slots.length) return []
  const ordered = slots.sort((a, b) => {
    const statusDelta = statusWeight(a?.status) - statusWeight(b?.status)
    if (statusDelta) return statusDelta
    return String(a?.slot_id || '').localeCompare(String(b?.slot_id || ''))
  }).slice(0, 12)
  return ordered.map((slot) => {
    const id = `${trimInline(String(slot?.slot_id || 'slot-?'), 12)} g${Math.max(1, Math.floor(Number(slot?.generation_index) || 1))}`
    const task = trimInline(String(slot?.task_title || ''), 24)
    const engine = workerBackendTag(slot?.backend, slot?.provider)
    const role = trimInline(String(slot?.role || 'worker'), 10)
    const status = trimInline(String(slot?.status || 'running'), 9)
    const file = trimInline(String(slot?.current_file || '-'), 30)
    const hb = slot?.latest_ts ? `${Math.max(0, Math.round((Date.now() - Date.parse(String(slot.latest_ts))) / 1000))}s` : '?'
    return `${id}${task && task !== 'worker task' ? ` · ${task}` : ''} · ${engine} · ${role} · ${status} · ${file} · hb ${hb}`
  })
}

function isMadSksSqlPlaneActive(capability: any) {
  if (!capability) return false
  if (capability.schema !== 'sks.mad-sks-sql-plane-capability.v2') return false
  if (!['transport_ready', 'active'].includes(String(capability.status || ''))) return false
  const expires = Date.parse(capability.expires_at || '')
  return Number.isFinite(expires) && expires > Date.now()
}

export function buildZellijSlotColumnAnchorCommand(input: {
  nodePath?: string
  cliPath: string
  missionId: string
  mode: string
  artifactRoot: string
  watch?: boolean
}) {
  const args = [
    input.cliPath,
    'zellij-slot-column-anchor',
    '--mission', input.missionId,
    '--mode', input.mode,
    '--artifact-root', input.artifactRoot,
    ...(input.watch ? ['--watch'] : [])
  ]
  return [input.nodePath || process.execPath, ...args].map(shellQuote).join(' ')
}

function inferMissionDir(root: string, missionId: string) {
  if (path.basename(root) === 'agents' && path.basename(path.dirname(root)) === missionId) return path.dirname(root)
  if (path.basename(root) === missionId && path.basename(path.dirname(root)) === 'missions') return root
  return path.join(root, '.sneakoscope', 'missions', missionId)
}

async function readJson(file: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function buildWorkerRows(root: string, missionDir: string, rightColumn: any, runtime: any): Promise<ZellijSlotColumnWorkerRow[]> {
  const byKey = new Map<string, ZellijSlotColumnWorkerRow & { yOrder?: number }>()
  const records = Array.isArray(runtime?.records) ? runtime.records : []
  const recordByKey = new Map<string, any>()
  for (const record of records) {
    const key = workerKey(record?.slot_id, record?.generation_index)
    if (key) recordByKey.set(key, record)
  }
  for (const pane of Array.isArray(rightColumn?.visible_worker_panes) ? rightColumn.visible_worker_panes : []) {
    const key = workerKey(pane?.slot_id, pane?.generation_index)
    if (!key) continue
    const record = recordByKey.get(key)
    byKey.set(key, await hydrateWorkerRow(root, missionDir, {
      slotId: String(pane.slot_id),
      generationIndex: Number(pane.generation_index || 1),
      placement: 'zellij-pane',
      status: pane.status || record?.status || 'running',
      paneId: pane.pane_id || record?.zellij_pane_id || null,
      yOrder: Number(pane.y_order || 0)
    }, record))
  }
  for (const row of Array.isArray(rightColumn?.headless_workers) ? rightColumn.headless_workers : []) {
    const key = workerKey(row?.slot_id, row?.generation_index)
    if (!key) continue
    const record = recordByKey.get(key)
    byKey.set(key, await hydrateWorkerRow(root, missionDir, {
      slotId: String(row.slot_id),
      generationIndex: Number(row.generation_index || 1),
      placement: 'headless',
      status: row.status || record?.status || 'running',
      reason: row.reason || record?.headless_reason || null,
      yOrder: 9000
    }, record))
  }
  for (const record of records) {
    const key = workerKey(record?.slot_id, record?.generation_index)
    if (!key || byKey.has(key)) continue
    byKey.set(key, await hydrateWorkerRow(root, missionDir, {
      slotId: String(record.slot_id || record.agent_id || 'slot-?'),
      generationIndex: Number(record.generation_index || 1),
      placement: record.worker_placement || (record.zellij_pane_id ? 'zellij-pane' : 'process'),
      status: record.status || 'running',
      paneId: record.zellij_pane_id || null,
      yOrder: 5000
    }, record))
  }
  return [...byKey.values()].sort((a, b) => {
    const statusDelta = statusWeight(a.status) - statusWeight(b.status)
    if (statusDelta) return statusDelta
    const yDelta = Number(a.yOrder || 0) - Number(b.yOrder || 0)
    if (yDelta) return yDelta
    return String(a.slotId).localeCompare(String(b.slotId))
  })
}

async function hydrateWorkerRow(root: string, missionDir: string, base: ZellijSlotColumnWorkerRow & { yOrder?: number }, record: any): Promise<ZellijSlotColumnWorkerRow & { yOrder?: number }> {
  const artifactDir = resolveArtifactDir(root, missionDir, record?.worker_artifact_dir)
  const result = artifactDir ? await readJson(path.join(artifactDir, 'worker-result.json')) : null
  const intake = artifactDir ? await readJson(path.join(artifactDir, 'worker-intake.json')) : null
  const heartbeatPath = artifactDir ? path.join(artifactDir, 'worker-heartbeat.jsonl') : null
  return {
    ...base,
    status: result?.status || base.status || record?.status || 'running',
    backend: result?.backend || record?.backend || intake?.backend || null,
    role: result?.persona_id || intake?.agent?.naruto_role || intake?.agent?.role || intake?.agent?.persona_id || null,
    task: firstText([
      result?.summary,
      Array.isArray(result?.changed_files) ? result.changed_files[0] : null,
      intake?.slice?.description,
      intake?.slice?.title,
      intake?.slice?.id,
      base.reason
    ]),
    worktreeId: result?.worktree?.id || record?.worktree?.id || intake?.worktree?.id || null,
    heartbeatAgeMs: heartbeatPath ? await heartbeatAgeMs(heartbeatPath) : null
  }
}

function renderWorkerRow(row: ZellijSlotColumnWorkerRow, index: number): string {
  const slot = `${trimInline(row.slotId || 'slot-?', 12)} g${Math.max(1, Math.floor(Number(row.generationIndex) || 1))}`
  const status = trimInline(row.status || 'running', 9)
  const backend = trimInline(row.backend || row.placement || '-', 12)
  const worktree = trimInline(row.worktreeId || row.role || '-', 10)
  const task = trimInline(row.task || row.reason || '-', 38)
  return `${String(index).padStart(2, '0')} ${slot} ${status} ${backend} ${worktree} · ${task} · hb ${formatHeartbeat(row.heartbeatAgeMs)}`
}

function resolveArtifactDir(root: string, missionDir: string, value: unknown): string | null {
  if (!value) return null
  const text = String(value)
  if (path.isAbsolute(text)) return text
  return path.join(root, text)
}

async function heartbeatAgeMs(file: string): Promise<number | null> {
  try {
    return Date.now() - (await fs.promises.stat(file)).mtimeMs
  } catch {
    return null
  }
}

function formatHeartbeat(ageMs: number | null | undefined): string {
  if (ageMs == null) return '?'
  if (ageMs < 1000) return 'now'
  return `${Math.max(1, Math.round(ageMs / 1000))}s`
}

function firstText(values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return null
}

function workerKey(slotId: unknown, generationIndex: unknown): string | null {
  const slot = String(slotId || '').trim()
  if (!slot) return null
  return `${slot}:g${Math.max(1, Math.floor(Number(generationIndex) || 1))}`
}

function statusWeight(status: unknown): number {
  const text = String(status || '').toLowerCase()
  if (text === 'running' || text === 'launching') return 0
  if (text === 'failed') return 1
  if (text === 'draining') return 2
  if (text === 'closed') return 3
  return 4
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

function trimInline(value: string, max: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return text.slice(0, Math.max(1, max - 3)) + '...'
}

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

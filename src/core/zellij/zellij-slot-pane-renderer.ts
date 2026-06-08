import fs from 'node:fs'
import path from 'node:path'
import { readZellijSlotTelemetrySnapshot, type ZellijSlotTelemetrySnapshot } from './zellij-slot-telemetry.js'

export interface ZellijSlotPaneRenderInput {
  slotId: string
  generationIndex: number
  sessionId?: string | null
  role?: string | null
  backend?: string | null
  status?: string | null
  fastMode?: boolean | string | null
  serviceTier?: string | null
  provider?: string | null
  authMode?: string | null
  model?: string | null
  reasoningEffort?: string | null
  currentTask?: string | null
  currentFile?: string | null
  changedFiles?: string[] | null
  plannedFiles?: string[] | null
  patchFiles?: string[] | null
  patchStatus?: string | null
  verifyStatus?: string | null
  heartbeatAgeMs?: number | null
  heartbeatEvent?: string | null
  worktreeId?: string | null
  eventLines?: string[] | null
  stdoutTail?: string[] | null
  stderrTail?: string[] | null
  mode?: 'compact-slots' | 'dashboard-plus-slots' | 'full-debug'
}

export function renderZellijSlotPane(input: ZellijSlotPaneRenderInput): string {
  const mode = input.mode || 'compact-slots'
  const maxLines = mode === 'compact-slots' ? 17 : mode === 'dashboard-plus-slots' ? 20 : 32
  const task = trimInline(input.currentTask || input.currentFile || 'waiting for worker intake', 78)
  const heartbeat = input.heartbeatAgeMs == null
    ? 'unknown'
    : input.heartbeatAgeMs < 1000
      ? 'now'
      : `${Math.max(1, Math.round(input.heartbeatAgeMs / 1000))}s ago`
  const files = firstNonEmptyList(input.changedFiles, input.patchFiles, input.plannedFiles, input.currentFile ? [input.currentFile] : [])
  const events = (input.eventLines || []).filter(Boolean).slice(-3)
  const stdout = (input.stdoutTail || []).filter(Boolean).slice(-2)
  const stderr = (input.stderrTail || []).filter(Boolean).slice(-1)
  const rows = [
    `slot: ${input.slotId} / gen-${Math.max(1, Math.floor(Number(input.generationIndex) || 1))} / ${trimInline(input.status || 'running', 18)}`,
    `role: ${trimInline(input.role || 'worker', 18)}  backend: ${trimInline(input.backend || 'codex-sdk', 20)}  worktree: ${trimInline(input.worktreeId || '-', 18)}`,
    `runtime: fast ${formatFastMode(input.fastMode, input.serviceTier)}  tier: ${trimInline(input.serviceTier || 'unknown', 12)}  provider: ${trimInline(input.provider || 'unknown', 18)}`,
    `model: ${trimInline(input.model || 'unknown', 28)}  reasoning: ${trimInline(input.reasoningEffort || 'unknown', 16)}${input.authMode ? `  auth: ${trimInline(input.authMode, 14)}` : ''}`,
    input.sessionId ? `session: ${trimInline(input.sessionId, 62)}` : null,
    `heartbeat: ${heartbeat}${input.heartbeatEvent ? `  event: ${trimInline(input.heartbeatEvent, 40)}` : ''}`,
    `doing: ${task}`,
    `files: ${trimInline(files.length ? files.join(', ') : 'no changed file yet', 78)}`,
    `patch: ${trimInline(input.patchStatus || 'queued', 24)}  verify: ${trimInline(input.verifyStatus || 'queued', 24)}`,
    ...events.map((event) => `event: ${trimInline(event, 78)}`),
    ...stdout.map((line) => `out: ${trimInline(line, 79)}`),
    ...stderr.map((line) => `err: ${trimInline(line, 79)}`)
  ].filter((row): row is string => Boolean(row))
  return frameSlotPane(`LIVE SLOT ${input.slotId}`, rows.slice(0, Math.max(1, maxLines - 2)))
}

export async function renderZellijSlotPaneFromArtifacts(input: {
  artifactDir: string
  artifactRoot?: string
  missionId?: string
  slotId: string
  generationIndex: number
  role?: string | null
  backend?: string | null
  mode?: ZellijSlotPaneRenderInput['mode']
}): Promise<string> {
  if (input.missionId && input.missionId !== 'latest') {
    const telemetry = await tryRenderTelemetrySlotPane({
      artifactRoot: input.artifactRoot || input.artifactDir,
      missionId: input.missionId,
      slotId: input.slotId,
      generationIndex: input.generationIndex
    })
    if (telemetry) return telemetry
    return [
      `${input.slotId} gen-${Math.max(1, Math.floor(Number(input.generationIndex) || 1))}`,
      'waiting for telemetry...',
      `mission ${input.missionId}`
    ].join('\n')
  }
  const artifactDir = path.resolve(input.artifactDir)
  const result = await readJson(path.join(artifactDir, 'worker-result.json'))
  const intake = await readJson(path.join(artifactDir, 'worker-intake.json'))
  const backendReport = await readJson(path.join(artifactDir, 'worker-backend-router-report.json'))
  const fastReport = await readJson(path.join(artifactDir, 'worker-fast-mode.json'))
  const paneReport = await readJson(path.join(artifactDir, 'zellij-worker-pane.json'))
  const codexProof = await readJson(path.join(artifactDir, 'codex-control-proof.json'))
  const localProof = await readJson(path.join(artifactDir, 'local-llm-proof.json'))
  const patch = await firstJson([
    path.join(artifactDir, 'worker-patch-envelope.json'),
    path.join(artifactDir, 'codex-sdk-patch-envelope.json'),
    path.join(artifactDir, 'python-codex-sdk-patch-envelope.json'),
    path.join(artifactDir, 'local-llm-patch-envelope.json')
  ])
  const heartbeatPath = path.join(artifactDir, 'worker-heartbeat.jsonl')
  const heartbeatMtime = await statMtimeMs(heartbeatPath)
  const heartbeatRows = await readJsonlTail(heartbeatPath, 2)
  const eventRows = await readJsonlTails([
    path.join(artifactDir, 'codex-sdk-events.jsonl'),
    path.join(artifactDir, 'python-codex-sdk-events.jsonl'),
    path.join(artifactDir, 'local-llm-events.jsonl'),
    path.join(artifactDir, 'zellij-worker-pane-events.jsonl')
  ], 6)
  const patchFiles = patchPaths(patch || result)
  const changedFiles = normalizeList(result?.changed_files)
  const plannedFiles = normalizeList([
    ...(Array.isArray(intake?.slice?.write_paths) ? intake.slice.write_paths : []),
    ...(Array.isArray(intake?.slice?.readonly_paths) ? intake.slice.readonly_paths : []),
    ...(Array.isArray(intake?.input_files) ? intake.input_files : [])
  ])
  const now = Date.now()
  return renderZellijSlotPane({
    slotId: input.slotId,
    generationIndex: input.generationIndex,
    sessionId: result?.session_id || intake?.agent?.session_id || backendReport?.session_id || null,
    role: input.role || result?.persona_id || intake?.agent?.naruto_role || intake?.agent?.role || intake?.agent?.persona_id || result?.agent_id || null,
    backend: input.backend || result?.backend || backendReport?.selected_backend || intake?.backend || null,
    status: result?.status || statusFromEvents(eventRows) || (heartbeatMtime ? 'running' : 'launching'),
    fastMode: firstDefined(fastReport?.fast_mode, backendReport?.fast_mode, result?.fast_mode, intake?.fast_mode),
    serviceTier: firstText([
      fastReport?.service_tier,
      paneReport?.service_tier,
      backendReport?.service_tier,
      codexProof?.config?.service_tier,
      result?.service_tier,
      intake?.service_tier
    ]),
    provider: firstText([
      paneReport?.provider_context?.provider,
      paneReport?.provider,
      codexProof?.config?.model_provider,
      localProof?.provider
    ]),
    authMode: firstText([
      paneReport?.provider_context?.auth_mode,
      codexProof?.config?.model_provider ? 'api_key' : null
    ]),
    model: firstText([
      codexProof?.config?.model,
      localProof?.model,
      intake?.ollama_model,
      intake?.local_model_model
    ]),
    reasoningEffort: firstText([
      codexProof?.config?.model_reasoning_effort,
      intake?.agent?.model_reasoning_effort,
      intake?.agent?.reasoning_effort
    ]),
    currentTask: firstText([
      result?.summary,
      intake?.slice?.description,
      intake?.slice?.title,
      intake?.slice?.id,
      lastEventLine(eventRows)
    ]),
    currentFile: changedFiles[0] || patchFiles[0] || plannedFiles[0] || null,
    changedFiles,
    plannedFiles,
    patchFiles,
    patchStatus: patchStatus(result, patch, patchFiles),
    verifyStatus: result?.verification?.status || 'queued',
    heartbeatAgeMs: heartbeatMtime ? now - heartbeatMtime : null,
    heartbeatEvent: heartbeatRows.length ? formatArtifactEvent(heartbeatRows[heartbeatRows.length - 1]) : null,
    worktreeId: result?.worktree?.id || intake?.worktree?.id || null,
    eventLines: eventRows.map(formatArtifactEvent).filter(Boolean),
    stdoutTail: await readTextTailLines(path.join(artifactDir, 'worker.stdout.log'), 2),
    stderrTail: await readTextTailLines(path.join(artifactDir, 'worker.stderr.log'), 1),
    mode: input.mode || 'compact-slots'
  })
}

export async function renderZellijSlotPaneStatusFromArtifacts(input: {
  artifactDir: string
  artifactRoot?: string
  missionId?: string
  slotId: string
  generationIndex: number
}) {
  const snapshot = input.missionId && input.missionId !== 'latest'
    ? await readZellijSlotTelemetrySnapshot(path.resolve(input.artifactRoot || input.artifactDir), input.missionId).catch(() => null)
    : null
  const status = telemetryStatus(snapshot)
  return {
    schema: 'sks.zellij-slot-pane-status.v1',
    mission_id: input.missionId || null,
    slot_id: input.slotId,
    generation_index: Math.max(1, Math.floor(Number(input.generationIndex) || 1)),
    telemetry_stale: status.telemetry_stale,
    telemetry_age_ms: status.telemetry_age_ms
  }
}

export function buildZellijSlotPaneCommand(input: {
  nodePath?: string
  cliPath: string
  missionId: string
  slotId: string
  generationIndex: number
  artifactDir: string
  artifactRoot?: string
  backend?: string | null
  role?: string | null
  mode?: ZellijSlotPaneRenderInput['mode']
  watch?: boolean
}) {
  const args = [
    input.cliPath,
    'zellij-slot-pane',
    '--mission', input.missionId,
    '--slot', input.slotId,
    '--generation', String(Math.max(1, Math.floor(Number(input.generationIndex) || 1))),
    '--artifact-dir', input.artifactDir,
    '--artifact-root', input.artifactRoot || input.artifactDir,
    '--mode', input.mode || 'compact-slots',
    ...(input.backend ? ['--backend', input.backend] : []),
    ...(input.role ? ['--role', input.role] : []),
    ...(input.watch ? ['--watch'] : [])
  ]
  return [input.nodePath || process.execPath, ...args].map(shellQuote).join(' ')
}

async function tryRenderTelemetrySlotPane(input: {
  artifactRoot: string
  missionId: string
  slotId: string
  generationIndex: number
}): Promise<string | null> {
  const snapshot = await readZellijSlotTelemetrySnapshot(path.resolve(input.artifactRoot), input.missionId).catch(() => null)
  if (!snapshot || !Object.keys(snapshot.slots || {}).length) return null
  const slot = findTelemetrySlot(snapshot, input.slotId, input.generationIndex)
  if (!slot) return null
  const staleRows = staleTelemetryRows(telemetryStatus(snapshot).telemetry_age_ms)
  if (slot.status === 'failed') {
    return [
      `${slot.slot_id} gen-${slot.generation_index} · FAILED`,
      ...staleRows,
      `blocker: ${trimInline(slot.blockers[0] || 'worker_failed', 78)}`,
      `artifact: ${trimInline(slot.artifact_paths[slot.artifact_paths.length - 1] || '-', 78)}`
    ].join('\n')
  }
  if (slot.status === 'completed' || slot.status === 'drained') {
    return [
      `${slot.slot_id} gen-${slot.generation_index} · done`,
      ...staleRows,
      `artifacts ${slot.artifact_paths.length} · ${slot.latest_event_type === 'verification_passed' ? 'verify passed' : 'verify queued'}`,
      'closing in 3s'
    ].join('\n')
  }
  const backend = [slot.backend, slot.service_tier, slot.worktree_id].filter((value) => value && value !== 'unknown').join(' · ') || 'worker'
  const heartbeat = slot.latest_ts ? `${Math.max(0, Math.round((Date.now() - Date.parse(slot.latest_ts)) / 1000))}s` : '?'
  return [
    `${slot.slot_id} gen-${slot.generation_index} · ${trimInline(slot.role || 'worker', 28)}`,
    ...staleRows,
    trimInline(backend, 78),
    `${slot.status}: ${trimInline(slot.task_title || 'worker task', 68)}`,
    `${formatTelemetryProgress(slot.progress)} · latest ${slot.latest_event_type} ${heartbeat}`,
    `${slot.latest_event_type === 'patch_candidate' ? 'patch candidate' : 'patch'}: ${slot.latest_event_type === 'patch_candidate' ? 'queued' : trimInline(slot.current_file || '-', 42)}`
  ].join('\n')
}

function findTelemetrySlot(snapshot: ZellijSlotTelemetrySnapshot, slotId: string, generationIndex: number) {
  const generation = Math.max(1, Math.floor(Number(generationIndex) || 1))
  return Object.values(snapshot.slots || {}).find((row) => row.slot_id === slotId && Number(row.generation_index) === generation) || null
}

function formatTelemetryProgress(progress: { done: number; total: number; label: string } | null) {
  if (!progress) return 'progress ?'
  return `progress ${progress.done}/${progress.total}${progress.label ? ` ${trimInline(progress.label, 24)}` : ''}`
}

function telemetryStatus(snapshot: ZellijSlotTelemetrySnapshot | null) {
  const parsed = snapshot?.updated_at ? Date.parse(snapshot.updated_at) : NaN
  const telemetryAgeMs = Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : Number.MAX_SAFE_INTEGER
  return {
    telemetry_stale: telemetryAgeMs > 3000,
    telemetry_age_ms: telemetryAgeMs
  }
}

function staleTelemetryRows(ageMs: number): string[] {
  if (!Number.isFinite(ageMs)) return ['telemetry stale; worker may still be running']
  if (ageMs > 10000) return ['telemetry stale; worker may still be running']
  if (ageMs > 3000) return [`telemetry stale ${(ageMs / 1000).toFixed(1)}s`]
  return []
}

async function readJson(file: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function firstJson(files: string[]): Promise<any | null> {
  for (const file of files) {
    const value = await readJson(file)
    if (value) return value
  }
  return null
}

async function statMtimeMs(file: string): Promise<number | null> {
  try {
    return (await fs.promises.stat(file)).mtimeMs
  } catch {
    return null
  }
}

async function readJsonlTails(files: string[], max: number): Promise<any[]> {
  const rows: any[] = []
  for (const file of files) rows.push(...await readJsonlTail(file, max))
  return rows
    .sort((a, b) => timestampMs(a) - timestampMs(b))
    .slice(-max)
}

async function readJsonlTail(file: string, max: number): Promise<any[]> {
  try {
    const lines = (await fs.promises.readFile(file, 'utf8')).split(/\r?\n/).filter((line) => line.trim())
    return lines.slice(-Math.max(1, max)).map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { message: line }
      }
    })
  } catch {
    return []
  }
}

async function readTextTailLines(file: string, max: number): Promise<string[]> {
  try {
    const lines = (await fs.promises.readFile(file, 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return lines.slice(-Math.max(1, max))
  } catch {
    return []
  }
}

function patchStatus(result: any, patch: any, files: string[]): string {
  const resultCount = Array.isArray(result?.patch_envelopes) ? result.patch_envelopes.length : 0
  const patchCount = Number(patch?.envelope_count || (Array.isArray(patch?.envelopes) ? patch.envelopes.length : 0))
  const count = Math.max(resultCount, Number.isFinite(patchCount) ? patchCount : 0)
  if (count > 0) return `candidate (${count})`
  if (files.length) return 'candidate'
  return 'queued'
}

function patchPaths(value: any): string[] {
  const envelopes = [
    ...(Array.isArray(value?.envelopes) ? value.envelopes : []),
    ...(Array.isArray(value?.patch_envelopes) ? value.patch_envelopes : [])
  ]
  return normalizeList(envelopes.flatMap((envelope: any) => {
    const paths = [
      ...(Array.isArray(envelope?.operations) ? envelope.operations.map((operation: any) => operation?.path) : []),
      ...(Array.isArray(envelope?.allowed_paths) ? envelope.allowed_paths : [])
    ]
    return paths
  }))
}

function statusFromEvents(rows: any[]): string | null {
  const last = rows[rows.length - 1]
  const status = String(last?.lane_status || last?.status || '').trim()
  if (status) return status
  const type = String(last?.event_type || last?.type || '').trim()
  if (/failed|blocked/i.test(type)) return 'blocked'
  if (/completed|finished|closed/i.test(type)) return 'done'
  if (type) return 'running'
  return null
}

function lastEventLine(rows: any[]): string | null {
  for (const row of [...rows].reverse()) {
    const text = formatArtifactEvent(row)
    if (text) return text
  }
  return null
}

function formatArtifactEvent(row: any): string {
  if (!row) return ''
  const status = trimInline(row.lane_status || row.status || row.event || row.event_type || row.type || row.sdk_event_type || 'event', 18)
  const detail = firstText([
    row.current_tool && row.current_file ? `tool ${row.current_tool} file ${row.current_file}` : null,
    row.current_file ? `file ${row.current_file}` : null,
    row.current_tool ? `tool ${row.current_tool}` : null,
    row.message_tail,
    row.blocker ? `blocker ${row.blocker}` : null,
    row.request_id,
    row.pane_id ? `pane ${row.pane_id}` : null,
    row.message,
    row.reason
  ])
  return trimInline(detail ? `${status}: ${detail}` : status, 96)
}

function timestampMs(row: any): number {
  const raw = row?.ts || row?.generated_at || row?.updated_at || row?.created_at
  const parsed = raw ? Date.parse(String(raw)) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function firstText(values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return null
}

function firstDefined(...values: unknown[]): string | boolean | null {
  for (const value of values) {
    if (value === true || value === false) return value
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

function firstNonEmptyList(...values: Array<string[] | null | undefined>): string[] {
  for (const value of values) {
    const normalized = normalizeList(value || [])
    if (normalized.length) return normalized
  }
  return []
}

function normalizeList(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || '').trim()).filter(Boolean))]
}

function trimInline(value: string, max: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return text.slice(0, Math.max(1, max - 3)) + '...'
}

function formatFastMode(value: unknown, serviceTier?: string | null): string {
  const text = String(value ?? '').trim().toLowerCase()
  if (value === true || text === 'true' || text === '1' || text === 'on' || text === 'fast') return 'on'
  if (value === false || text === 'false' || text === '0' || text === 'off' || text === 'standard') return 'off'
  const tier = String(serviceTier || '').trim().toLowerCase()
  if (tier === 'fast' || tier === 'priority') return 'on'
  if (tier === 'standard' || tier === 'default') return 'off'
  return 'unknown'
}

function frameSlotPane(title: string, rows: string[]): string {
  const width = Math.min(96, Math.max(44, title.length + 6, ...rows.map((row) => row.length + 4)))
  const line = '+' + '-'.repeat(width - 2) + '+'
  const label = ` ${trimInline(title, width - 4)} `
  const titleLine = '|' + label.padEnd(width - 2, ' ') + '|'
  const body = rows.map((row) => {
    const text = ` ${trimInline(row, width - 4)} `
    return '|' + text.padEnd(width - 2, ' ') + '|'
  })
  return [line, titleLine, line, ...body, line].join('\n')
}

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

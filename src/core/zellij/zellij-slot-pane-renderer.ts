import fs from 'node:fs'
import path from 'node:path'
import { readZellijSlotTelemetrySnapshot, type ZellijSlotTelemetrySnapshot } from './zellij-slot-telemetry.js'
import { resolveZellijTheme, paint, statusBadge, progressBar, elapsed, ANSI_CODES, type ZellijTheme } from './zellij-theme.js'

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
  qaAppHandoffPending?: boolean | null
  qaAppHandoffArtifact?: string | null
  loopId?: string | null
  loopRole?: string | null
  loopGate?: string | null
  progress?: { done: number; total: number; label?: string | null } | null
  blockers?: string[] | null
  telemetryTs?: string | null
  mode?: 'compact-slots' | 'full-debug'
}

export function renderZellijSlotPane(input: ZellijSlotPaneRenderInput): string {
  const theme = resolveZellijTheme()
  const W = Math.max(20, theme.width - 4)
  const t = (s: unknown, w: number = W) => trimInline(String(s ?? ''), w)
  const mode = input.mode || 'compact-slots'
  const maxLines = mode === 'compact-slots' ? 14 : 30
  const events = (input.eventLines || []).filter(Boolean).slice(-10)
  const stdout = (input.stdoutTail || []).filter(Boolean).slice(-6)
  const stderr = (input.stderrTail || []).filter(Boolean).slice(-1)
  const fullDebug = mode === 'full-debug'
  const fixtureLoopProof = String(input.backend || '').includes('fixture') || String(input.patchStatus || '').includes('fixture')
  const meta = [input.model || input.provider || '?', input.reasoningEffort || '?', input.serviceTier || '?'].filter(Boolean).join('·')
  const head = `${statusBadge(theme, input.status || 'queued')}  ${paint(theme, ANSI_CODES.bold, input.slotId)}` +
    `  ${t(input.role || 'worker', 12)}  ${paint(theme, ANSI_CODES.dim, t(meta, 28))}`
  const prog = input.progress && input.progress.total > 0
    ? progressBar(theme, input.progress.done, input.progress.total)
    : paint(theme, ANSI_CODES.dim, `elapsed ${elapsed(input.telemetryTs) || '-'}  heartbeat ${formatHeartbeat(input.heartbeatAgeMs)}`)
  const doing = `${paint(theme, ANSI_CODES.bold, '▸ ')}${t(input.currentTask || 'waiting for work item')}`
  const file = input.currentFile ? paint(theme, ANSI_CODES.dim, `file ${t(input.currentFile)}`) : null
  const worktree = input.worktreeId ? paint(theme, ANSI_CODES.dim, `worktree ${t(input.worktreeId, 32)}`) : null
  const patch = ((input.patchStatus && input.patchStatus !== 'queued') || (input.verifyStatus && input.verifyStatus !== 'queued'))
    ? `patch ${t(input.patchStatus || '-', 18)} · verify ${t(input.verifyStatus || '-', 18)}`
    : null
  const blockers = (input.blockers || []).slice(0, 2).map((b) => paint(theme, ANSI_CODES.red, `! ${t(b)}`))
  const tail = [
    ...stderr.slice(-1).map((line) => paint(theme, ANSI_CODES.red, `err ${t(line)}`)),
    ...stdout.slice(-3).map((line) => paint(theme, ANSI_CODES.dim, `    ${t(line)}`))
  ]
  const rows = [
    head,
    prog,
    doing,
    file,
    worktree,
    patch,
    input.qaAppHandoffPending ? `QA app handoff pending: ${t(input.qaAppHandoffArtifact || 'qa-loop/app-handoff.json')}` : null,
    ...blockers,
    ...tail,
    ...(fullDebug ? [
      input.sessionId ? `session ${t(input.sessionId, 62)}` : null,
      input.loopId ? `loop ${t(input.loopId, 28)} · ${t(input.loopRole || input.role || 'worker', 14)}` : null,
      input.loopGate ? `gate ${t(input.loopGate)}` : null,
      fixtureLoopProof ? 'fixture loop proof · not production execution' : null,
      ...events.map((event) => `event ${t(event)}`)
    ] : [])
  ].filter((row): row is string => Boolean(row))
  return frameSlotPane(input.slotId, rows.slice(0, Math.max(1, maxLines - 2)), theme)
}

export async function renderZellijSlotPaneFromArtifacts(input: {
  artifactDir: string
  artifactRoot?: string
  missionId?: string
  slotId: string
  generationIndex: number
  role?: string | null
  backend?: string | null
  provider?: string | null
  model?: string | null
  serviceTier?: string | null
  reasoningEffort?: string | null
  currentTask?: string | null
  mode?: ZellijSlotPaneRenderInput['mode']
}): Promise<string> {
  const detail = await renderInputFromArtifactDir(input).catch(() => null)
  if (input.missionId && input.missionId !== 'latest') {
    const telemetry = await readZellijSlotTelemetrySnapshot(path.resolve(input.artifactRoot || input.artifactDir), input.missionId).catch(() => null)
    const live = findTelemetrySlot(telemetry, input.slotId, input.generationIndex)
    const merged = mergeRenderInputWithLiveTelemetry({
      slotId: input.slotId,
      generationIndex: input.generationIndex,
      role: input.role ?? null,
      backend: input.backend ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      serviceTier: input.serviceTier ?? null,
      reasoningEffort: input.reasoningEffort ?? null,
      currentTask: input.currentTask ?? null,
      status: 'launching',
      mode: input.mode || 'compact-slots',
      ...(detail || {})
    }, live)
    return renderZellijSlotPane(merged)
  }
  const fallbackInput: ZellijSlotPaneRenderInput = {
    slotId: input.slotId,
    generationIndex: input.generationIndex,
    status: 'launching',
    currentTask: input.currentTask || 'waiting for worker intake',
    mode: input.mode || 'compact-slots'
  }
  if (input.role !== undefined) fallbackInput.role = input.role
  if (input.backend !== undefined) fallbackInput.backend = input.backend
  if (input.provider !== undefined) fallbackInput.provider = input.provider
  if (input.model !== undefined) fallbackInput.model = input.model
  if (input.serviceTier !== undefined) fallbackInput.serviceTier = input.serviceTier
  if (input.reasoningEffort !== undefined) fallbackInput.reasoningEffort = input.reasoningEffort
  return renderZellijSlotPane(detail || fallbackInput)
}

function mergeRenderInputWithLiveTelemetry(detail: ZellijSlotPaneRenderInput, live: ZellijSlotTelemetrySnapshot['slots'][string] | null): ZellijSlotPaneRenderInput {
  if (!live) return detail
  return {
    ...detail,
    status: live.status ?? detail.status,
    currentTask: live.task_title || detail.currentTask || null,
    currentFile: live.current_file || detail.currentFile || null,
    role: live.role || detail.role || null,
    backend: preferKnownTelemetryValue(live.backend, detail.backend),
    provider: preferKnownTelemetryValue(live.provider, detail.provider),
    model: preferKnownTelemetryValue(live.model, detail.model),
    serviceTier: preferKnownTelemetryValue(live.service_tier, detail.serviceTier),
    reasoningEffort: preferKnownTelemetryValue(live.reasoning_effort, detail.reasoningEffort),
    progress: live.progress ?? null,
    blockers: live.blockers || [],
    telemetryTs: live.latest_ts || null,
    heartbeatAgeMs: live.latest_ts ? Math.max(0, Date.now() - Date.parse(live.latest_ts)) : detail.heartbeatAgeMs ?? null,
    worktreeId: live.worktree_id || detail.worktreeId || null,
    stdoutTail: live.log_tail
      ? [...(detail.stdoutTail || []), ...String(live.log_tail).split(/\r?\n/).filter(Boolean)].slice(-6)
      : detail.stdoutTail || []
  }
}

function preferKnownTelemetryValue(live: unknown, fallback: unknown): string | null {
  const liveText = String(live || '').trim()
  if (liveText && liveText.toLowerCase() !== 'unknown' && liveText !== '?') return liveText
  const fallbackText = String(fallback || '').trim()
  return fallbackText && fallbackText.toLowerCase() !== 'unknown' && fallbackText !== '?' ? fallbackText : null
}

async function renderZellijSlotPaneFromArtifactDir(input: {
  artifactDir: string
  slotId: string
  generationIndex: number
  role?: string | null
  backend?: string | null
  mode?: ZellijSlotPaneRenderInput['mode']
}): Promise<string | null> {
  const detail = await renderInputFromArtifactDir(input)
  if (!detail) return null
  return renderZellijSlotPane(detail)
}

async function renderInputFromArtifactDir(input: {
  artifactDir: string
  slotId: string
  generationIndex: number
  role?: string | null
  backend?: string | null
  provider?: string | null
  model?: string | null
  serviceTier?: string | null
  reasoningEffort?: string | null
  currentTask?: string | null
  mode?: ZellijSlotPaneRenderInput['mode']
}): Promise<ZellijSlotPaneRenderInput | null> {
  const envDefaults = {
    provider: (input.provider ?? process.env.SKS_SLOT_PROVIDER) || null,
    model: (input.model ?? process.env.SKS_SLOT_MODEL) || null,
    serviceTier: (input.serviceTier ?? process.env.SKS_SLOT_TIER) || null,
    reasoningEffort: (input.reasoningEffort ?? process.env.SKS_SLOT_REASONING) || null,
    currentTask: (input.currentTask ?? process.env.SKS_SLOT_TASK) || null,
    role: (input.role ?? process.env.SKS_SLOT_ROLE) || null
  }
  const detail = await renderInputFromArtifactDirRaw(input)
  if (!detail) {
    return {
      slotId: input.slotId,
      generationIndex: input.generationIndex,
      role: envDefaults.role,
      backend: input.backend || null,
      provider: envDefaults.provider,
      model: envDefaults.model,
      serviceTier: envDefaults.serviceTier,
      reasoningEffort: envDefaults.reasoningEffort,
      currentTask: envDefaults.currentTask || 'waiting for worker intake',
      status: 'launching',
      mode: input.mode || 'compact-slots'
    }
  }
  return {
    ...detail,
    role: detail.role || envDefaults.role,
    provider: detail.provider || envDefaults.provider,
    model: detail.model || envDefaults.model,
    serviceTier: detail.serviceTier || envDefaults.serviceTier,
    reasoningEffort: detail.reasoningEffort || envDefaults.reasoningEffort,
    currentTask: detail.currentTask || envDefaults.currentTask
  }
}

async function renderInputFromArtifactDirRaw(input: {
  artifactDir: string
  slotId: string
  generationIndex: number
  role?: string | null
  backend?: string | null
  mode?: ZellijSlotPaneRenderInput['mode']
}): Promise<ZellijSlotPaneRenderInput | null> {
  const artifactDir = path.resolve(input.artifactDir)
  const result = await readJson(path.join(artifactDir, 'worker-result.json'))
  const intake = await readJson(path.join(artifactDir, 'worker-intake.json'))
  const backendReport = await readJson(path.join(artifactDir, 'worker-backend-router-report.json'))
  const processReport = await readJson(path.join(artifactDir, 'worker-process-report.json'))
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
  ], 10)
  const patchFiles = patchPaths(patch || result)
  const changedFiles = normalizeList(result?.changed_files)
  const plannedFiles = normalizeList([
    ...(Array.isArray(intake?.slice?.write_paths) ? intake.slice.write_paths : []),
    ...(Array.isArray(intake?.slice?.readonly_paths) ? intake.slice.readonly_paths : []),
    ...(Array.isArray(intake?.input_files) ? intake.input_files : [])
  ])
  const now = Date.now()
  const qaAppHandoff = await readQaAppHandoffNearArtifactDir(artifactDir)
  if (!result && !intake && !backendReport && !processReport && !paneReport && !codexProof && !localProof && !heartbeatMtime && !eventRows.length) return null
  return {
    slotId: input.slotId,
    generationIndex: input.generationIndex,
    sessionId: result?.session_id || intake?.agent?.session_id || backendReport?.session_id || null,
    role: input.role || result?.persona_id || intake?.agent?.naruto_role || intake?.agent?.role || intake?.agent?.persona_id || result?.agent_id || null,
    backend: input.backend || result?.backend || backendReport?.selected_backend || intake?.backend || null,
    status: result?.status || statusFromEvents(eventRows) || (heartbeatMtime ? 'running' : 'launching'),
    fastMode: firstDefined(processReport?.fast_mode, backendReport?.fast_mode, result?.fast_mode, intake?.fast_mode),
    serviceTier: firstText([
      processReport?.service_tier,
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
    stdoutTail: await readTextTailLines(path.join(artifactDir, 'worker.stdout.log'), 6),
    stderrTail: await readTextTailLines(path.join(artifactDir, 'worker.stderr.log'), 1),
    qaAppHandoffPending: ['pending', 'blocked_for_desktop_review'].includes(String(qaAppHandoff?.status || '')),
    qaAppHandoffArtifact: qaAppHandoff?.artifact_path || null,
    mode: input.mode || 'compact-slots'
  }
}

async function readQaAppHandoffNearArtifactDir(artifactDir: string) {
  let current = path.resolve(artifactDir)
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(current, 'qa-loop', 'app-handoff.json')
    const json = await readJson(candidate)
    if (json) return json
    const next = path.dirname(current)
    if (next === current) break
    current = next
  }
  return null
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

// Root-cause-3 fix: the watch loop never exited, so completed/failed panes lingered forever and
// kept re-reporting staleness. Resolve whether this slot has reached a terminal state (status is
// completed/failed/drained in telemetry) AND its worker-result.json exists, so the pane command
// can render one final frame and exit instead of looping indefinitely.
export async function resolveZellijSlotPaneExit(input: {
  artifactDir: string
  artifactRoot?: string
  missionId?: string
  slotId: string
  generationIndex: number
}): Promise<boolean> {
  const resultExists = Boolean(await readJson(path.join(path.resolve(input.artifactDir), 'worker-result.json')))
  if (!resultExists) return false
  if (!input.missionId || input.missionId === 'latest') return true
  const snapshot = await readZellijSlotTelemetrySnapshot(path.resolve(input.artifactRoot || input.artifactDir), input.missionId).catch(() => null)
  if (!snapshot) return true
  const slot = findTelemetrySlot(snapshot, input.slotId, input.generationIndex)
  if (!slot) return true
  return slot.status === 'completed' || slot.status === 'failed' || slot.status === 'drained'
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
  provider?: string | null
  model?: string | null
  serviceTier?: string | null
  reasoningEffort?: string | null
  currentTask?: string | null
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
  const env = {
    SKS_SLOT_PROVIDER: String(input.provider || ''),
    SKS_SLOT_MODEL: String(input.model || ''),
    SKS_SLOT_TIER: String(input.serviceTier || ''),
    SKS_SLOT_REASONING: String(input.reasoningEffort || ''),
    SKS_SLOT_TASK: String(input.currentTask || '').slice(0, 200),
    SKS_SLOT_ROLE: String(input.role || '')
  }
  const envPrefix = Object.entries(env)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
  return [...envPrefix, input.nodePath || process.execPath, ...args].map((part, index) => index < envPrefix.length ? part : shellQuote(part)).join(' ')
}

function findTelemetrySlot(snapshot: ZellijSlotTelemetrySnapshot | null | undefined, slotId: string, generationIndex: number) {
  if (!snapshot) return null
  const generation = Math.max(1, Math.floor(Number(generationIndex) || 1))
  return Object.values(snapshot.slots || {}).find((row) => row.slot_id === slotId && Number(row.generation_index) === generation) || null
}

function telemetryStatus(snapshot: ZellijSlotTelemetrySnapshot | null) {
  const parsed = snapshot?.updated_at ? Date.parse(snapshot.updated_at) : NaN
  const telemetryAgeMs = Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : Number.MAX_SAFE_INTEGER
  return {
    // Root-cause-3 fix: with a 1000ms+jitter flush throttle the old 3000ms threshold flapped
    // constantly. Raise to 15000ms so brief gaps between flushes don't read as "stale", and only
    // claim the worker may be gone after 60000ms of true silence.
    telemetry_stale: telemetryAgeMs > 15000,
    telemetry_age_ms: telemetryAgeMs
  }
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
  // Prefer the latest LLM message text (message_tail/message) so the live pane shows what the
  // model is actually saying, falling back to tool/file/blocker context when no message exists.
  const detail = firstText([
    row.message_tail,
    row.message,
    row.current_tool && row.current_file ? `tool ${row.current_tool} file ${row.current_file}` : null,
    row.current_file ? `file ${row.current_file}` : null,
    row.current_tool ? `tool ${row.current_tool}` : null,
    row.blocker ? `blocker ${row.blocker}` : null,
    row.request_id,
    row.pane_id ? `pane ${row.pane_id}` : null,
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

function normalizeList(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || '').trim()).filter(Boolean))]
}

function trimInline(value: string, max: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return text.slice(0, Math.max(1, max - 1)) + '…'
}

function formatHeartbeat(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'unknown'
  if (value < 1000) return 'now'
  return `${Math.max(1, Math.round(value / 1000))}s`
}

function frameSlotPane(title: string, rows: string[], theme: ZellijTheme): string {
  const width = theme.width
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
  const inner = width - 2
  const visibleTitle = strip(title)
  const top = `┌─ ${title} ${'─'.repeat(Math.max(0, inner - visibleTitle.length - 4))}┐`
  const body = rows.map((row) => {
    const visible = strip(row)
    const clipped = visible.length > inner - 2 ? trimInline(row, inner - 2) : row
    const pad = Math.max(0, inner - strip(clipped).length - 1)
    return `│ ${clipped}${' '.repeat(pad)}│`
  })
  return [paint(theme, ANSI_CODES.gray, top), ...body, paint(theme, ANSI_CODES.gray, `└${'─'.repeat(inner)}┘`)].join('\n')
}

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

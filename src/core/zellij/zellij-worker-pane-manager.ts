import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, packageRoot, readJson, writeJsonAtomic } from '../fsx.js'
import { providerPaneLabel } from '../provider/provider-badge.js'
import { resolveProviderContext, type ProviderContext } from '../provider/provider-context.js'
import { runZellij, type ZellijCommandResult } from './zellij-command.js'
import { extractZellijPaneIdFromOutput } from './zellij-lane-runtime.js'

export const ZELLIJ_WORKER_PANE_SCHEMA = 'sks.zellij-worker-pane.v1'
export const ZELLIJ_WORKER_PANE_EVENT_SCHEMA = 'sks.zellij-worker-pane-event.v1'

export type ZellijWorkerPaneIdSource =
  | 'zellij_worker_new_pane_stdout'
  | 'zellij_worker_list_panes'
  | 'zellij_worker_pane_stdout_missing'
  | 'zellij_worker_pane_launch_failed'

export interface ZellijWorkerPaneOpenInput {
  root: string
  missionId: string
  sessionName: string
  slotId: string
  generationIndex: number
  sessionId: string
  workerArtifactDir: string
  workerCommand: string
  resultPath: string
  heartbeatPath: string
  patchEnvelopePath: string
  stdoutLog: string
  stderrLog: string
  cwd?: string
  providerContext?: ProviderContext | null
  serviceTier?: string | null
}

export interface ZellijWorkerPaneRecord {
  schema: typeof ZELLIJ_WORKER_PANE_SCHEMA
  generated_at: string
  updated_at: string
  ok: boolean
  status: 'launching' | 'running' | 'closed' | 'failed'
  mission_id: string
  session_name: string
  slot_id: string
  generation_index: number
  session_id: string
  pane_name: string
  pane_title: string
  pane_kind: 'worker_codex_sdk'
  pane_id: string | null
  pane_id_source: ZellijWorkerPaneIdSource
  provider: string
  service_tier: string
  provider_context: ProviderContext
  worker_artifact_dir: string
  worker_result_path: string
  heartbeat_path: string
  patch_envelope_path: string
  stdout_log: string
  stderr_log: string
  parent_child_transport: 'worker-result-json-and-heartbeat'
  scaling_primitive: 'native_cli_process_in_zellij_worker_pane'
  command: string
  create_session: ZellijCommandResult | null
  launch: ZellijCommandResult | null
  pane_reconciliation: any
  opened_at: string
  closed_at: string | null
  close: ZellijCommandResult | null
  direction_requested: 'right'
  direction_applied: 'right' | 'unknown' | 'not_applied'
  sdk_thread_id?: string | null
  sdk_run_id?: string | null
  stream_event_count?: number
  structured_output_valid?: boolean
  blockers: string[]
}

export function buildWorkerPaneName(slotId: string, generationIndex: number) {
  return `${slotId}/gen-${Math.max(1, Math.floor(Number(generationIndex) || 1))}`
}

export function buildWorkerPaneTitle(slotId: string, generationIndex: number, context?: ProviderContext | null, serviceTier?: string | null) {
  const base = buildWorkerPaneName(slotId, generationIndex)
  const normalized = normalizePaneProviderContext(context, serviceTier)
  return `${base} · codex-sdk · ${providerPaneLabel(normalized)}`
}

export function isRealZellijWorkerPaneIdSource(value: unknown) {
  return value === 'zellij_worker_new_pane_stdout' || value === 'zellij_worker_list_panes'
}

export function buildWorkerPaneArtifact(input: Omit<ZellijWorkerPaneOpenInput, 'workerCommand'> & {
  paneId?: string | null
  paneIdSource?: ZellijWorkerPaneIdSource
  createSession?: ZellijCommandResult | null
  launch?: ZellijCommandResult | null
  paneReconciliation?: any
  directionApplied?: 'right' | 'unknown' | 'not_applied'
  status?: ZellijWorkerPaneRecord['status']
  sdkThreadId?: string | null
  sdkRunId?: string | null
  streamEventCount?: number
  structuredOutputValid?: boolean
  blockers?: string[]
}): ZellijWorkerPaneRecord {
  const now = nowIso()
  const paneIdSource = input.paneIdSource || 'zellij_worker_pane_launch_failed'
  const blockers = input.blockers || []
  const providerContext = normalizePaneProviderContext(input.providerContext, input.serviceTier)
  const paneTitle = buildWorkerPaneTitle(input.slotId, input.generationIndex, providerContext, input.serviceTier)
  return {
    schema: ZELLIJ_WORKER_PANE_SCHEMA,
    generated_at: now,
    updated_at: now,
    ok: blockers.length === 0 && isRealZellijWorkerPaneIdSource(paneIdSource) && Boolean(input.paneId),
    status: input.status || 'launching',
    mission_id: input.missionId,
    session_name: input.sessionName,
    slot_id: input.slotId,
    generation_index: input.generationIndex,
    session_id: input.sessionId,
    pane_name: paneTitle,
    pane_title: paneTitle,
    pane_kind: 'worker_codex_sdk',
    pane_id: input.paneId || null,
    pane_id_source: paneIdSource,
    provider: providerContext.provider,
    service_tier: providerContext.service_tier,
    provider_context: providerContext,
    worker_artifact_dir: input.workerArtifactDir,
    worker_result_path: input.resultPath,
    heartbeat_path: input.heartbeatPath,
    patch_envelope_path: input.patchEnvelopePath,
    stdout_log: input.stdoutLog,
    stderr_log: input.stderrLog,
    parent_child_transport: 'worker-result-json-and-heartbeat',
    scaling_primitive: 'native_cli_process_in_zellij_worker_pane',
    command: '<native-cli-worker-command>',
    create_session: input.createSession || null,
    launch: input.launch || null,
    pane_reconciliation: input.paneReconciliation || null,
    opened_at: now,
    closed_at: null,
    close: null,
    direction_requested: 'right',
    direction_applied: input.directionApplied || 'not_applied',
    sdk_thread_id: input.sdkThreadId || null,
    sdk_run_id: input.sdkRunId || null,
    stream_event_count: Number(input.streamEventCount || 0),
    structured_output_valid: input.structuredOutputValid === true,
    blockers
  }
}

export async function openWorkerPane(input: ZellijWorkerPaneOpenInput): Promise<ZellijWorkerPaneRecord> {
  const root = path.resolve(input.root)
  const cwd = input.cwd || packageRoot()
  const providerInput: Parameters<typeof resolveProviderContext>[0] = { root, route: '$Agent' }
  const serviceTier = input.serviceTier || process.env.SKS_SERVICE_TIER
  if (serviceTier != null) providerInput.serviceTier = serviceTier
  const providerContext = input.providerContext || await resolveProviderContext(providerInput)
  const workerDir = path.join(root, input.workerArtifactDir)
  await ensureDir(workerDir)
  await appendWorkerPaneEvent(root, 'session_launch_started', input, {})
  const createSession = await runZellij(['attach', '--create-background', input.sessionName], {
    cwd,
    timeoutMs: 5000,
    optional: false
  })
  const paneName = buildWorkerPaneTitle(input.slotId, input.generationIndex, providerContext, input.serviceTier)
  let launch = createSession.ok
    ? await runZellij(['--session', input.sessionName, 'action', 'new-pane', '--direction', 'right', '--name', paneName, '--', 'sh', '-lc', input.workerCommand], {
        cwd,
        timeoutMs: 5000,
        optional: false
      })
    : null
  let directionApplied: ZellijWorkerPaneRecord['direction_applied'] = launch?.ok ? 'right' : 'not_applied'
  if (createSession.ok && launch && !launch.ok) {
    const fallback = await runZellij(['--session', input.sessionName, 'action', 'new-pane', '--name', paneName, '--', 'sh', '-lc', input.workerCommand], {
      cwd,
      timeoutMs: 5000,
      optional: false
    })
    if (fallback.ok) {
      launch = fallback
      directionApplied = 'unknown'
    }
  }
  const stdoutPaneId = launch?.ok ? extractZellijPaneIdFromOutput(launch.stdout_tail) : null
  const reconciledPane = stdoutPaneId ? null : launch?.ok ? await reconcileZellijWorkerPaneId(input.sessionName, paneName, path.join(root, input.resultPath), cwd) : null
  const paneId = stdoutPaneId || reconciledPane?.pane_id || null
  const paneIdSource: ZellijWorkerPaneIdSource = stdoutPaneId
    ? 'zellij_worker_new_pane_stdout'
    : reconciledPane?.pane_id
      ? 'zellij_worker_list_panes'
      : launch?.ok
        ? 'zellij_worker_pane_stdout_missing'
        : 'zellij_worker_pane_launch_failed'
  const blockers = [
    ...(createSession.ok ? [] : createSession.blockers.map((blocker) => `zellij_worker_session_${blocker}`)),
    ...(launch && !launch.ok ? launch.blockers.map((blocker) => `zellij_worker_pane_${blocker}`) : []),
    ...(launch?.ok && !isRealZellijWorkerPaneIdSource(paneIdSource) ? ['zellij_worker_pane_id_real_source_missing'] : [])
  ]
  const record = buildWorkerPaneArtifact({
    ...input,
    paneId,
    paneIdSource,
    createSession,
    launch,
    paneReconciliation: reconciledPane,
    directionApplied,
    status: blockers.length ? 'failed' : 'running',
    providerContext,
    serviceTier: input.serviceTier || providerContext.service_tier,
    blockers
  })
  await writeWorkerPaneArtifact(root, record)
  await appendWorkerPaneEvent(root, 'zellij_worker_pane_created', input, {
    ok: record.ok,
    pane_id: record.pane_id,
    pane_id_source: record.pane_id_source,
    blockers
  })
  await appendJsonl(path.join(root, 'agent-zellij-pane-launch-ledger.jsonl'), {
    schema: 'sks.agent-zellij-pane-launch.v1',
    generated_at: nowIso(),
    launch_mode: record.ok ? 'real_zellij_worker_pane_session' : 'real_zellij_worker_pane_failed',
    agent_id: input.slotId,
    slot_id: input.slotId,
    generation_index: input.generationIndex,
    session_id: input.sessionId,
    session_name: input.sessionName,
    pane_name: paneName,
    pane_title: paneName,
    pane_kind: 'worker_codex_sdk',
    pane_id: record.pane_id,
    pane_id_source: record.pane_id_source,
    provider: record.provider,
    service_tier: record.service_tier,
    provider_context: record.provider_context,
    direction_requested: record.direction_requested,
    direction_applied: record.direction_applied,
    command: '<native-cli-worker-command>',
    worker_artifact_dir: input.workerArtifactDir,
    worker_result_path: input.resultPath,
    heartbeat_path: input.heartbeatPath,
    patch_envelope_path: input.patchEnvelopePath,
    parent_child_transport: 'worker-result-json-and-heartbeat',
    persistent_slot_lane: false,
    scaling_primitive: 'native_cli_process_in_zellij_worker_pane',
    blockers
  })
  return record
}

export async function closeWorkerPane(input: {
  root: string
  paneRecord: ZellijWorkerPaneRecord
  cwd?: string
  status?: 'closed' | 'failed'
  blockers?: string[]
  sdkThreadId?: string | null
  sdkRunId?: string | null
  streamEventCount?: number
  structuredOutputValid?: boolean
  workerResultPath?: string | null
}) {
  const root = path.resolve(input.root)
  const close = process.env.SKS_ZELLIJ_CLOSE_WORKER_PANE === '1' && input.paneRecord.pane_id
    ? await runZellij(['--session', input.paneRecord.session_name, 'action', 'close-pane', '--pane-id', input.paneRecord.pane_id], {
        cwd: input.cwd || packageRoot(),
        timeoutMs: 5000,
        optional: true
      })
    : null
  const next: ZellijWorkerPaneRecord = {
    ...input.paneRecord,
    updated_at: nowIso(),
    ok: input.paneRecord.ok && !(input.blockers || []).length,
    status: input.status || ((input.blockers || []).length ? 'failed' : 'closed'),
    closed_at: nowIso(),
    close,
    sdk_thread_id: input.sdkThreadId || input.paneRecord.sdk_thread_id || null,
    sdk_run_id: input.sdkRunId || input.paneRecord.sdk_run_id || null,
    stream_event_count: Number(input.streamEventCount || input.paneRecord.stream_event_count || 0),
    structured_output_valid: input.structuredOutputValid === true || input.paneRecord.structured_output_valid === true,
    worker_result_path: input.workerResultPath || input.paneRecord.worker_result_path,
    blockers: [...input.paneRecord.blockers, ...(input.blockers || []), ...(close && !close.ok ? close.blockers.map((blocker) => `zellij_worker_close_${blocker}`) : [])]
  }
  await writeWorkerPaneArtifact(root, next)
  await appendWorkerPaneEvent(root, 'pane_closed', {
    root,
    missionId: next.mission_id,
    sessionName: next.session_name,
    slotId: next.slot_id,
    generationIndex: next.generation_index,
    sessionId: next.session_id,
    workerArtifactDir: next.worker_artifact_dir,
    resultPath: next.worker_result_path,
    heartbeatPath: next.heartbeat_path,
    patchEnvelopePath: next.patch_envelope_path,
    stdoutLog: next.stdout_log,
    stderrLog: next.stderr_log,
    workerCommand: ''
  }, { status: next.status, pane_id: next.pane_id, blockers: next.blockers })
  return next
}

export function evaluateZellijWorkerPaneSpawnOrder(events: Array<Record<string, unknown>>) {
  const sequence = ['session_launch_started', 'zellij_worker_pane_created', 'worker_started', 'codex_sdk_thread_started', 'result_written', 'pane_closed']
  const seen = new Map<string, number>()
  events.forEach((event, index) => {
    const type = String(event.event_type || event.event || '')
    if (sequence.includes(type) && !seen.has(type)) seen.set(type, index)
  })
  const missing = sequence.filter((event) => !seen.has(event))
  const outOfOrder = sequence.slice(1).filter((event, index) => {
    const previous = seen.get(sequence[index] || '')
    const current = seen.get(event)
    return previous !== undefined && current !== undefined && current < previous
  })
  return {
    schema: 'sks.zellij-worker-pane-spawn-order-proof.v1',
    ok: missing.length === 0 && outOfOrder.length === 0,
    required_order: sequence,
    observed_order: events.map((event) => String(event.event_type || event.event || '')).filter((event) => sequence.includes(event)),
    missing,
    out_of_order: outOfOrder,
    blockers: [...missing.map((event) => `spawn_order_missing_${event}`), ...outOfOrder.map((event) => `spawn_order_out_of_order_${event}`)]
  }
}

export async function readWorkerPaneRecord(root: string, workerArtifactDir: string) {
  return readJson<ZellijWorkerPaneRecord>(path.join(path.resolve(root), workerArtifactDir, 'zellij-worker-pane.json'), null as any)
}

async function writeWorkerPaneArtifact(root: string, record: ZellijWorkerPaneRecord) {
  await writeJsonAtomic(path.join(root, record.worker_artifact_dir, 'zellij-worker-pane.json'), record)
  await writeJsonAtomic(path.join(root, record.worker_artifact_dir, 'zellij-worker-pane-launch.json'), record)
}

async function appendWorkerPaneEvent(root: string, eventType: string, input: ZellijWorkerPaneOpenInput, payload: Record<string, unknown>) {
  await appendJsonl(path.join(root, input.workerArtifactDir, 'zellij-worker-pane-events.jsonl'), {
    schema: ZELLIJ_WORKER_PANE_EVENT_SCHEMA,
    ts: nowIso(),
    event_type: eventType,
    mission_id: input.missionId,
    session_name: input.sessionName,
    slot_id: input.slotId,
    generation_index: input.generationIndex,
    session_id: input.sessionId,
    worker_artifact_dir: input.workerArtifactDir,
    ...payload
  })
}

async function reconcileZellijWorkerPaneId(sessionName: string, paneName: string, resultPath: string, cwd: string) {
  const listed = await runZellij(['--session', sessionName, 'action', 'list-panes', '--json', '--all'], {
    cwd,
    timeoutMs: 5000,
    optional: true
  })
  const rows = parsePaneRows(listed.stdout_tail)
  const pane = rows.find((row: any) => {
    const title = String(row.title || row.name || row.pane_name || '')
    const command = String(row.terminal_command || row.command || row.command_line || row.running_command || '')
    const exited = row.exited === true || row.is_exited === true || row.exit_status != null
    return !exited && title === paneName && (command.includes(resultPath) || command.includes('SKS_ZELLIJ_WORKER_PANE'))
  }) || rows.find((row: any) => {
    const title = String(row.title || row.name || row.pane_name || '')
    const exited = row.exited === true || row.is_exited === true || row.exit_status != null
    return !exited && title === paneName
  })
  const paneId = pane?.pane_id ?? pane?.paneId ?? pane?.id ?? null
  return {
    schema: 'sks.zellij-worker-pane-reconciliation.v1',
    ok: Boolean(paneId),
    pane_id: paneId == null ? null : String(paneId),
    listed_count: rows.length,
    command: listed,
    blockers: paneId == null ? ['zellij_worker_pane_id_not_reconciled'] : []
  }
}

function normalizePaneProviderContext(context?: ProviderContext | null, serviceTier?: string | null): ProviderContext {
  const tier = normalizeServiceTier(serviceTier || context?.service_tier)
  return context
    ? { ...context, service_tier: tier }
    : {
        schema: 'sks.provider-context.v1',
        generated_at: nowIso(),
        provider: 'unknown',
        auth_mode: 'unknown',
        route: '$Agent',
        service_tier: tier,
        source: 'unknown',
        confidence: 'low',
        conflict: false,
        warnings: [],
        signals: {
          openai_api_key_present: false,
          codex_lb_key_present: false,
          codex_lb_explicit: false,
          codex_app_auth_present: false,
          model_provider: null
        }
      }
}

function normalizeServiceTier(value: unknown): ProviderContext['service_tier'] {
  const text = String(value || '').toLowerCase()
  if (text === 'fast' || text === 'priority') return 'fast'
  if (text === 'standard' || text === 'default') return 'standard'
  return 'unknown'
}

function parsePaneRows(text: unknown): any[] {
  if (!String(text || '').trim()) return []
  try {
    const parsed = JSON.parse(String(text))
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.panes)) return parsed.panes
    return []
  } catch {
    return []
  }
}

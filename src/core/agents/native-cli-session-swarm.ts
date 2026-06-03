import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { appendJsonl, ensureDir, exists, nowIso, packageRoot, readJson, writeJsonAtomic } from '../fsx.js'
import { fastModeEnv, type FastModePolicy } from './fast-mode-policy.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'
import { closeWorkerPane, openWorkerPane } from '../zellij/zellij-worker-pane-manager.js'
import { resolveProviderContext } from '../provider/provider-context.js'

export const NATIVE_CLI_SESSION_SWARM_SCHEMA = 'sks.agent-native-cli-session-swarm.v1'

export function createNativeCliSessionSwarmRecorder(root: string, input: {
  missionId: string
  requestedAgents: number
  targetActiveSlots: number
  backend: string
  route: string
  fastModePolicy: FastModePolicy
}) {
  return new NativeCliSessionSwarmRecorder(root, input)
}

class NativeCliSessionSwarmRecorder {
  private records: any[] = []
  private active = new Set<number>()
  private maxObserved = 0
  private writeLock: Promise<unknown> = Promise.resolve()
  private nextPaneToken = -1

  constructor(private root: string, private input: { missionId: string; requestedAgents: number; targetActiveSlots: number; backend: string; route: string; fastModePolicy: FastModePolicy }) {}

  async initialize() {
    await this.persist()
  }

  async launchWorker(ctx: { agent: any; slice: any; opts: any }) {
    const workerDirRel = path.join(ctx.agent.session_artifact_dir || path.join('sessions', ctx.agent.id), 'worker')
    const workerDir = path.join(this.root, workerDirRel)
    await ensureDir(workerDir)
    const intakeRel = path.join(workerDirRel, 'worker-intake.json')
    const resultRel = path.join(workerDirRel, 'worker-result.json')
    const heartbeatRel = path.join(workerDirRel, 'worker-heartbeat.jsonl')
    const patchRel = path.join(workerDirRel, 'worker-patch-envelope.json')
    const stdoutRel = path.join(workerDirRel, 'worker.stdout.log')
    const stderrRel = path.join(workerDirRel, 'worker.stderr.log')
    const intake = {
      schema: 'sks.native-cli-worker-intake.v1',
      generated_at: nowIso(),
      mission_id: this.input.missionId,
      parent_mission_id: this.input.missionId,
      route: this.input.route,
      backend: this.input.backend,
      agent_root: this.root,
      agent: ctx.agent,
      slice: ctx.slice,
      worker_artifact_dir: workerDirRel,
      result_path: resultRel,
      heartbeat_path: heartbeatRel,
      patch_envelope_path: patchRel,
      service_tier: this.input.fastModePolicy.service_tier,
      fast_mode: this.input.fastModePolicy.fast_mode,
      source_intelligence_refs: ctx.agent.source_intelligence_refs || null,
      goal_mode_ref: ctx.agent.goal_mode_ref || null,
      strategy_refs: ctx.slice?.strategy_refs || null,
      min_runtime_ms: this.input.targetActiveSlots >= 10 ? 8000 : this.input.targetActiveSlots >= 2 ? 2000 : 25,
      recursion_guard_env: true
    }
    await writeJsonAtomic(path.join(this.root, intakeRel), intake)
    const cliPath = await resolveWorkerCliPath()
    const args = [cliPath, '--agent', 'worker', '--intake', path.join(this.root, intakeRel), '--json']
    const commandLine = [process.execPath, ...redactWorkerArgs(args)]
    const record: any = {
      schema: 'sks.native-cli-session-record.v1',
      launched_at: nowIso(),
      closed_at: null,
      mission_id: this.input.missionId,
      agent_id: ctx.agent.id,
      session_id: ctx.agent.session_id,
      slot_id: ctx.agent.slot_id || null,
      generation_index: ctx.agent.generation_index || null,
      task_slice_id: ctx.slice?.id || null,
      backend: this.input.backend,
      pid: null,
      process_id: null,
      command_line: commandLine,
      stdout_log: stdoutRel,
      stderr_log: stderrRel,
      worker_artifact_dir: workerDirRel,
      worker_intake: intakeRel,
      result_path: resultRel,
      heartbeat_path: heartbeatRel,
      patch_envelope_path: patchRel,
      fast_mode: this.input.fastModePolicy.fast_mode,
      service_tier: this.input.fastModePolicy.service_tier,
      status: 'launching',
      exit_code: null,
      blockers: []
    }
    const stdout = fs.createWriteStream(path.join(this.root, stdoutRel), { flags: 'a' })
    const stderr = fs.createWriteStream(path.join(this.root, stderrRel), { flags: 'a' })
    if (this.input.backend === 'zellij' && ctx.opts.real === true && ctx.opts.zellijPaneWorker !== false) {
      stdout.end()
      stderr.end()
      return this.launchWorkerInZellijPane({
        ctx,
        record,
        args,
        resultRel,
        stdoutRel,
        stderrRel,
        heartbeatRel,
        workerDirRel
      })
    }
    const child = spawn(process.execPath, args, {
      cwd: ctx.opts.cwd || packageRoot(),
      env: {
        ...process.env,
        ...(ctx.opts.env || {}),
        ...fastModeEnv(this.input.fastModePolicy),
        SKS_AGENT_WORKER: '1',
        SKS_PIPELINE_MODE: 'agent-worker',
        SKS_DISABLE_ROUTE_RECURSION: '1',
        SKS_PARENT_MISSION_ID: this.input.missionId,
        SKS_AGENT_SESSION_ID: String(ctx.agent.session_id || ''),
        SKS_AGENT_SLOT_ID: String(ctx.agent.slot_id || ''),
        SKS_AGENT_GENERATION_INDEX: String(ctx.agent.generation_index || 1)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    record.pid = child.pid || null
    record.process_id = child.pid || null
    record.status = 'running'
    if (child.pid) this.active.add(child.pid)
    this.maxObserved = Math.max(this.maxObserved, this.active.size)
    await this.record(record)
    child.stdout?.pipe(stdout)
    child.stderr?.pipe(stderr)
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }))
      child.on('error', () => resolve({ code: 1, signal: null }))
    })
    stdout.end()
    stderr.end()
    if (child.pid) this.active.delete(child.pid)
    record.closed_at = nowIso()
    record.exit_code = exit.code
    record.signal = exit.signal
    record.status = exit.code === 0 ? 'closed' : 'failed'
    const parsed = await readJson<any>(path.join(this.root, resultRel), null).catch(() => null)
    if (!parsed) {
      record.blockers = ['native_cli_worker_result_missing']
      await this.record(record)
      return validateAgentWorkerResult({
        mission_id: this.input.missionId,
        agent_id: ctx.agent.id,
        session_id: ctx.agent.session_id,
        persona_id: ctx.agent.persona_id || ctx.agent.id,
        task_slice_id: ctx.slice?.id || '',
        status: 'failed',
        backend: this.input.backend,
        summary: 'Native CLI worker result missing.',
        artifacts: [stdoutRel, stderrRel],
        blockers: record.blockers,
        unverified: [],
        writes: [],
        source_intelligence_refs: ctx.agent.source_intelligence_refs || null,
        goal_mode_ref: ctx.agent.goal_mode_ref || null
      })
    }
    const result = validateAgentWorkerResult({
      ...parsed,
      artifacts: [...(Array.isArray(parsed.artifacts) ? parsed.artifacts : []), stdoutRel, stderrRel]
    })
    record.status = result.status === 'done' ? 'closed' : result.status
    record.blockers = result.blockers || []
    await this.record(record)
    return result
  }

  private async launchWorkerInZellijPane(input: {
    ctx: { agent: any; slice: any; opts: any }
    record: any
    args: string[]
    resultRel: string
    stdoutRel: string
    stderrRel: string
    heartbeatRel: string
    workerDirRel: string
  }) {
    const sessionName = String(input.ctx.opts.zellijSessionName || (this.input.missionId ? `sks-${this.input.missionId}` : 'sks-agent-runtime'))
    const slotId = String(input.ctx.agent.slot_id || input.ctx.agent.id || 'slot-001')
    const activeToken = this.nextPaneToken--
    this.active.add(activeToken)
    this.maxObserved = Math.max(this.maxObserved, this.active.size)

    const workerCommand = buildPaneWorkerCommand({
      args: input.args,
      stdoutPath: path.join(this.root, input.stdoutRel),
      stderrPath: path.join(this.root, input.stderrRel),
      heartbeatPath: path.join(this.root, input.heartbeatRel),
      env: {
        ...(input.ctx.opts.env || {}),
        ...fastModeEnv(this.input.fastModePolicy),
        SKS_AGENT_WORKER: '1',
        SKS_PIPELINE_MODE: 'agent-worker',
        SKS_DISABLE_ROUTE_RECURSION: '1',
        SKS_PARENT_MISSION_ID: this.input.missionId,
        SKS_AGENT_SESSION_ID: String(input.ctx.agent.session_id || ''),
        SKS_AGENT_SLOT_ID: slotId,
        SKS_AGENT_GENERATION_INDEX: String(input.ctx.agent.generation_index || 1),
        SKS_ZELLIJ_WORKER_PANE: '1',
        SKS_ZELLIJ_SESSION_NAME: sessionName
      }
    })
    const providerContext = await resolveProviderContext({
      root: this.root,
      route: this.input.route,
      serviceTier: this.input.fastModePolicy.service_tier
    })
    let paneRecord = await openWorkerPane({
      root: this.root,
      missionId: this.input.missionId,
      sessionName,
      slotId,
      generationIndex: Number(input.ctx.agent.generation_index || 1),
      sessionId: String(input.ctx.agent.session_id || ''),
      workerArtifactDir: input.workerDirRel,
      workerCommand,
      resultPath: input.resultRel,
      heartbeatPath: input.heartbeatRel,
      patchEnvelopePath: input.record.patch_envelope_path,
      stdoutLog: input.stdoutRel,
      stderrLog: input.stderrRel,
      cwd: input.ctx.opts.cwd || packageRoot(),
      providerContext,
      serviceTier: this.input.fastModePolicy.service_tier
    })
    const launchBlockers = paneRecord.blockers || []
    input.record.command_line = ['zellij', '--session', sessionName, 'action', 'new-pane', '--name', paneRecord.pane_name, '--', 'sh', '-lc', '<native-cli-worker-command>']
    input.record.zellij_session_name = sessionName
    input.record.zellij_pane_id = paneRecord.pane_id || null
    input.record.zellij_pane_id_source = paneRecord.pane_id_source
    input.record.zellij_create_session = paneRecord.create_session
    input.record.zellij_launch = paneRecord.launch
    input.record.zellij_worker_pane = path.join(input.workerDirRel, 'zellij-worker-pane.json')
    input.record.pane_kind = 'worker_codex_sdk'
    input.record.scaling_primitive = 'native_cli_process_in_zellij_worker_pane'
    input.record.provider = paneRecord.provider
    input.record.service_tier = paneRecord.service_tier
    input.record.provider_context = paneRecord.provider_context
    input.record.status = launchBlockers.length ? 'failed' : 'running'
    input.record.blockers = launchBlockers
    await this.record(input.record)
    if (launchBlockers.length) {
      this.active.delete(activeToken)
      input.record.closed_at = nowIso()
      input.record.status = 'failed'
      await this.record(input.record)
      return validateAgentWorkerResult({
        mission_id: this.input.missionId,
        agent_id: input.ctx.agent.id,
        session_id: input.ctx.agent.session_id,
        persona_id: input.ctx.agent.persona_id || input.ctx.agent.id,
        task_slice_id: input.ctx.slice?.id || '',
        status: 'failed',
        backend: this.input.backend,
        summary: 'Zellij worker pane launch failed.',
        artifacts: [input.stdoutRel, input.stderrRel, path.join(input.workerDirRel, 'zellij-worker-pane.json')],
        blockers: launchBlockers,
        unverified: [],
        writes: [],
        source_intelligence_refs: input.ctx.agent.source_intelligence_refs || null,
        goal_mode_ref: input.ctx.agent.goal_mode_ref || null
      })
    }

    await waitForWorkerHeartbeat(path.join(this.root, input.heartbeatRel), Number(process.env.SKS_ZELLIJ_WORKER_HEARTBEAT_TIMEOUT_MS || 30000))
    await appendJsonl(path.join(this.root, input.workerDirRel, 'zellij-worker-pane-events.jsonl'), {
      schema: 'sks.zellij-worker-pane-event.v1',
      ts: nowIso(),
      event_type: 'worker_started',
      mission_id: this.input.missionId,
      slot_id: slotId,
      generation_index: input.ctx.agent.generation_index || null,
      session_id: input.ctx.agent.session_id,
      worker_artifact_dir: input.workerDirRel
    })
    const parsed = await waitForWorkerResult(path.join(this.root, input.resultRel), Number(process.env.SKS_ZELLIJ_WORKER_RESULT_TIMEOUT_MS || 120000))
    this.active.delete(activeToken)
    input.record.closed_at = nowIso()
    const workerProcessReport = await readJson<any>(path.join(this.root, input.workerDirRel, 'worker-process-report.json'), null).catch(() => null)
    const sdkThreadId = workerProcessReport?.sdk_thread_id || workerProcessReport?.backend_router_report?.sdk_thread_id || parsed?.codex_sdk_thread?.sdk_thread_id || parsed?.codex_child_report?.sdk_thread_id || null
    const sdkRunId = workerProcessReport?.sdk_run_id || workerProcessReport?.backend_router_report?.sdk_run_id || parsed?.codex_sdk_thread?.sdk_run_id || parsed?.codex_child_report?.sdk_run_id || null
    if ((workerProcessReport?.backend_child_process_ids || []).length || sdkThreadId) {
      await appendJsonl(path.join(this.root, input.workerDirRel, 'zellij-worker-pane-events.jsonl'), {
        schema: 'sks.zellij-worker-pane-event.v1',
        ts: nowIso(),
        event_type: 'codex_sdk_thread_started',
        mission_id: this.input.missionId,
        slot_id: slotId,
        generation_index: input.ctx.agent.generation_index || null,
        session_id: input.ctx.agent.session_id,
        child_process_ids: workerProcessReport?.backend_child_process_ids || [],
        sdk_thread_id: sdkThreadId,
        sdk_run_id: sdkRunId
      })
    }
    if (parsed) {
      await appendJsonl(path.join(this.root, input.workerDirRel, 'zellij-worker-pane-events.jsonl'), {
        schema: 'sks.zellij-worker-pane-event.v1',
        ts: nowIso(),
        event_type: 'result_written',
        mission_id: this.input.missionId,
        slot_id: slotId,
        generation_index: input.ctx.agent.generation_index || null,
        session_id: input.ctx.agent.session_id,
        result_path: input.resultRel
      })
    }
    input.record.pid = Number(workerProcessReport?.pid) || null
    input.record.process_id = input.record.pid
    input.record.sdk_thread_id = sdkThreadId
    input.record.sdk_run_id = sdkRunId
    input.record.stream_event_count = Number(workerProcessReport?.stream_event_count || workerProcessReport?.backend_router_report?.stream_event_count || 0)
    input.record.structured_output_valid = workerProcessReport?.structured_output_valid === true || workerProcessReport?.backend_router_report?.structured_output_valid === true
    input.record.exit_code = parsed ? (parsed.status === 'done' ? 0 : 1) : 1
    input.record.status = parsed?.status === 'done' ? 'closed' : 'failed'
    const heartbeatOk = await hasHeartbeat(path.join(this.root, input.heartbeatRel))
    input.record.blockers = [
      ...(parsed ? parsed.blockers || [] : ['zellij_worker_result_timeout']),
      ...(heartbeatOk ? [] : ['zellij_worker_heartbeat_missing'])
    ]
    paneRecord = await closeWorkerPane({
      root: this.root,
      paneRecord,
      cwd: input.ctx.opts.cwd || packageRoot(),
      status: input.record.status === 'closed' ? 'closed' : 'failed',
      blockers: input.record.blockers,
      sdkThreadId,
      sdkRunId,
      streamEventCount: input.record.stream_event_count,
      structuredOutputValid: input.record.structured_output_valid,
      workerResultPath: input.resultRel
    })
    input.record.zellij_worker_pane_closed_at = paneRecord.closed_at
    await this.record(input.record)
    if (!parsed) {
      return validateAgentWorkerResult({
        mission_id: this.input.missionId,
        agent_id: input.ctx.agent.id,
        session_id: input.ctx.agent.session_id,
        persona_id: input.ctx.agent.persona_id || input.ctx.agent.id,
        task_slice_id: input.ctx.slice?.id || '',
        status: 'failed',
        backend: this.input.backend,
        summary: 'Zellij pane worker result timed out.',
        artifacts: [input.stdoutRel, input.stderrRel, path.join(input.workerDirRel, 'zellij-worker-pane.json')],
        blockers: input.record.blockers,
        unverified: [],
        writes: [],
        source_intelligence_refs: input.ctx.agent.source_intelligence_refs || null,
        goal_mode_ref: input.ctx.agent.goal_mode_ref || null
      })
    }
    return validateAgentWorkerResult({
      ...parsed,
      blockers: input.record.blockers,
      artifacts: [...new Set([...(Array.isArray(parsed.artifacts) ? parsed.artifacts : []), input.stdoutRel, input.stderrRel, path.join(input.workerDirRel, 'zellij-worker-pane.json')])]
    })
  }

  async finalize() {
    await this.persist()
    return this.summary()
  }

  private async record(record: any) {
    const index = this.records.findIndex((row) => row.session_id === record.session_id)
    if (index >= 0) this.records[index] = record
    else this.records.push(record)
    await this.persist()
  }

  private async persist() {
    this.writeLock = this.writeLock.catch(() => undefined).then(async () => {
      await writeJsonAtomic(path.join(this.root, 'agent-native-cli-session-swarm.json'), this.summary())
    })
    await this.writeLock
  }

  private summary() {
    const closed = this.records.filter((row) => row.status === 'closed')
    const processIds = this.records.map((row) => row.pid).filter((pid) => Number.isFinite(Number(pid)))
    return {
      schema: NATIVE_CLI_SESSION_SWARM_SCHEMA,
      generated_at: nowIso(),
      ok: this.records.every((row) => row.status === 'closed'),
      mission_id: this.input.missionId,
      route: this.input.route,
      backend: this.input.backend,
      scaling_primitive: this.records.some((row) => row.scaling_primitive === 'native_cli_process_in_zellij_worker_pane') ? 'native_cli_process_in_zellij_worker_pane' : 'native_cli_process',
      zellij_pane_worker_sessions: this.records.filter((row) => row.scaling_primitive === 'native_cli_process_in_zellij_worker_pane').length,
      requested_agents: this.input.requestedAgents,
      target_active_slots: this.input.targetActiveSlots,
      spawned_worker_process_count: this.records.length,
      closed_worker_process_count: closed.length,
      max_observed_worker_process_count: this.maxObserved,
      active_worker_process_count: this.active.size,
      unique_worker_session_count: new Set(this.records.map((row) => row.session_id).filter(Boolean)).size,
      unique_slot_count: new Set(this.records.map((row) => row.slot_id).filter(Boolean)).size,
      unique_generation_count: new Set(this.records.map((row) => `${row.slot_id}:${row.generation_index}`).filter(Boolean)).size,
      process_ids: processIds,
      worker_command_lines: this.records.map((row) => row.command_line),
      stdout_logs: this.records.map((row) => row.stdout_log),
      stderr_logs: this.records.map((row) => row.stderr_log),
      worker_artifact_dirs: this.records.map((row) => row.worker_artifact_dir),
      service_tier: this.input.fastModePolicy.service_tier,
      fast_mode: this.input.fastModePolicy.fast_mode,
      records: this.records,
      blockers: this.records.flatMap((row) => row.blockers || [])
    }
  }
}

export function buildPaneWorkerCommand(input: { args: string[]; stdoutPath: string; stderrPath: string; heartbeatPath: string; env: Record<string, unknown> }) {
  const envPrefix = Object.entries(input.env)
    .filter(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && value != null)
    .map(([key, value]) => `${key}=${shellQuote(String(value))}`)
    .sort()
  const command = [shellQuote(process.execPath), ...input.args.map(shellQuote)].join(' ')
  const heartbeat = `printf '%s\\n' ${shellQuote(JSON.stringify({ schema: 'sks.zellij-worker-pane-event.v1', event: 'worker_command_exited' }))} >> ${shellQuote(input.heartbeatPath)}`
  const holdMs = Math.max(0, Number(process.env.SKS_ZELLIJ_WORKER_PANE_HOLD_MS || 1500))
  const hold = holdMs > 0 ? `sleep ${shellQuote(String(Math.min(30, holdMs / 1000)))}` : ':'
  return `${envPrefix.join(' ')} ${command} > ${shellQuote(input.stdoutPath)} 2> ${shellQuote(input.stderrPath)}; code=$?; ${heartbeat}; ${hold}; exit $code`.trim()
}

async function waitForWorkerResult(file: string, timeoutMs: number) {
  const deadline = Date.now() + Math.max(1000, timeoutMs)
  while (Date.now() < deadline) {
    const result = await readJson<any>(file, null).catch(() => null)
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

async function waitForWorkerHeartbeat(file: string, timeoutMs: number) {
  const deadline = Date.now() + Math.max(1000, timeoutMs)
  while (Date.now() < deadline) {
    if (await hasHeartbeat(file)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function hasHeartbeat(file: string) {
  try {
    const text = await fs.promises.readFile(file, 'utf8')
    return text.trim().length > 0
  } catch {
    return false
  }
}

async function resolveWorkerCliPath() {
  if (process.env.SKS_NATIVE_WORKER_CLI) return process.env.SKS_NATIVE_WORKER_CLI
  const distCli = path.join(packageRoot(), 'dist', 'bin', 'sks.js')
  if (await exists(distCli)) return distCli
  return path.join(packageRoot(), 'src', 'bin', 'sks.ts')
}

function redactWorkerArgs(args: string[]) {
  return args.map((arg, index) => index > 0 && args[index - 1] === '--intake' ? '<worker-intake.json>' : arg)
}

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

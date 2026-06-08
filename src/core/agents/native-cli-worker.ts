import path from 'node:path'
import { ensureDir, nowIso, readJson, writeJsonAtomic, appendJsonl } from '../fsx.js'
import { scanAgentTextForRecursion } from './agent-recursion-guard.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'
import { resolveFastModePolicy } from './fast-mode-policy.js'
import { runNativeWorkerBackendRouter } from './native-worker-backend-router.js'
import { appendZellijSlotTelemetry, type ZellijSlotTelemetryEventType, type ZellijSlotTelemetryStatus } from '../zellij/zellij-slot-telemetry.js'

export const NATIVE_CLI_WORKER_SCHEMA = 'sks.native-cli-worker.v1'

export async function runNativeCliWorkerFromArgs(args: string[] = []) {
  const parsed = parseNativeCliWorkerArgs(args)
  const result = await runNativeCliWorker(parsed)
  if (parsed.json) console.log(JSON.stringify(result, null, 2))
  else console.log(result.summary || result.status)
  if (result.status !== 'done') process.exitCode = 1
  return result
}

export async function runNativeCliWorker(input: any = {}) {
  const intakePath = String(input.intake || input.intakePath || '')
  const intake = intakePath ? await readJson<any>(intakePath, null) : input.intakeJson || {}
  const agentRoot = path.resolve(String(input.agentRoot || intake.agent_root || intake.agentRoot || process.cwd()))
  const agent = {
    ...(intake.agent || {}),
    native_cli_worker_session_id: intake.agent?.session_id || input.sessionId || '',
    native_cli_process_id: process.pid
  }
  const slice = intake.slice || {}
  const backend = String(input.backend || intake.backend || 'fake')
  const workerCwd = path.resolve(String(input.cwd || intake.cwd || process.cwd()))
  const worktree = normalizeWorkerWorktree(input.worktree || intake.worktree || null)
  const policy = resolveFastModePolicy({
    fastMode: intake.fast_mode ?? input.fastMode,
    serviceTier: intake.service_tier ?? input.serviceTier
  })
  const workerDirRel = String(input.artifactDir || intake.worker_artifact_dir || path.join(agent.session_artifact_dir || path.join('sessions', agent.id || 'worker'), 'worker'))
  const workerDir = path.resolve(agentRoot, workerDirRel)
  const resultRel = String(input.resultPath || intake.result_path || path.join(workerDirRel, 'worker-result.json'))
  const heartbeatRel = String(input.heartbeatPath || intake.heartbeat_path || path.join(workerDirRel, 'worker-heartbeat.jsonl'))
  const patchRel = String(input.patchEnvelopePath || intake.patch_envelope_path || path.join(workerDirRel, 'worker-patch-envelope.json'))
  await ensureDir(workerDir)
  try {
    process.chdir(workerCwd)
  } catch {}
  const recursion = scanAgentTextForRecursion(JSON.stringify({ agent, slice, backend }))
  const guard = {
    schema: 'sks.native-cli-worker-recursion-guard.v1',
    generated_at: nowIso(),
    ok: recursion.ok && process.env.SKS_DISABLE_ROUTE_RECURSION === '1',
    recursion_guard_env: process.env.SKS_DISABLE_ROUTE_RECURSION === '1',
    worker_env: process.env.SKS_AGENT_WORKER === '1',
    violations: recursion.violations
  }
	  await writeJsonAtomic(path.join(workerDir, 'worker-intake.json'), {
    schema: NATIVE_CLI_WORKER_SCHEMA,
    generated_at: nowIso(),
    parent_mission_id: String(intake.parent_mission_id || input.parentMissionId || intake.mission_id || ''),
    slot_id: String(agent.slot_id || input.slotId || ''),
    generation_index: Number(agent.generation_index || input.generationIndex || 1),
    task_id: String(slice.id || input.taskId || ''),
    persona_id: String(agent.persona_id || input.personaId || ''),
    lease_id: String(intake.lease_id || input.leaseId || ''),
    agent_root: agentRoot,
    main_repo_root: String(input.mainRepoRoot || intake.main_repo_root || worktree?.main_repo_root || agentRoot),
    cwd: workerCwd,
    worktree,
    worker_artifact_dir: workerDirRel,
    result_path: resultRel,
    heartbeat_path: heartbeatRel,
    patch_envelope_path: patchRel,
    backend,
    codex_task: {
      backend: backend === 'zellij' ? 'codex-sdk' : backend,
      output_schema_id: 'sks.agent-worker-result.v1',
      sandbox_policy: Array.isArray(slice.write_paths) && slice.write_paths.length > 0 ? 'workspace-write' : 'read-only',
      thread_policy: 'new_thread_per_generation',
      worktree,
      cwd: workerCwd
    },
    service_tier: policy.service_tier,
    fast_mode: policy.fast_mode,
    source_intelligence_refs: agent.source_intelligence_refs || intake.source_intelligence_refs || null,
    goal_mode_ref: agent.goal_mode_ref || intake.goal_mode_ref || null,
    strategy_refs: slice.strategy_refs || intake.strategy_refs || null,
    no_recursive_orchestrator_guard: guard.ok
	  })
	  await workerTelemetry(agentRoot, intake, agent, slice, {
	    eventType: 'task_started',
	    status: 'running',
	    backend,
	    serviceTier: policy.service_tier,
	    artifacts: [path.join(workerDirRel, 'worker-intake.json'), heartbeatRel],
	    logTail: String(slice.description || slice.title || slice.id || 'worker task started')
	  })
	  await appendJsonl(path.resolve(agentRoot, heartbeatRel), {
    schema: 'sks.native-cli-worker-heartbeat.v1',
    ts: nowIso(),
    event: 'started',
    pid: process.pid,
    session_id: agent.session_id,
    slot_id: agent.slot_id || null,
    generation_index: agent.generation_index || null,
    fast_mode: policy.fast_mode,
	    service_tier: policy.service_tier
	  })
	  await workerTelemetry(agentRoot, intake, agent, slice, {
	    eventType: 'heartbeat',
	    status: 'running',
	    backend,
	    serviceTier: policy.service_tier,
	    artifacts: [heartbeatRel],
	    logTail: 'worker heartbeat started'
	  })
  await writeJsonAtomic(path.join(workerDir, 'worker-fast-mode.json'), {
    schema: 'sks.native-cli-worker-fast-mode.v1',
    generated_at: nowIso(),
    ok: true,
    fast_mode: policy.fast_mode,
    service_tier: policy.service_tier,
    env: {
      SKS_FAST_MODE: process.env.SKS_FAST_MODE || null,
      SKS_SERVICE_TIER: process.env.SKS_SERVICE_TIER || null
    }
  })
  await writeJsonAtomic(path.join(workerDir, 'worker-recursion-guard.json'), guard)
  let noPatchReason: any = null
  const routed = await runNativeWorkerBackendRouter({
    agentRoot,
    workerDirRel,
    resultRel,
    patchRel,
    agent,
    slice,
    intake: { ...intake, ...input },
    backend,
    fastModePolicy: policy,
    guard
  })
  const patchEnvelopes = routed.patchEnvelopes
	  if (patchEnvelopes.length) {
	    await writeJsonAtomic(path.resolve(agentRoot, patchRel), {
      schema: 'sks.native-cli-worker-patch-envelope.v1',
      generated_at: nowIso(),
      ok: true,
      envelope_count: patchEnvelopes.length,
      proof_level: routed.report.proof_level,
	      envelopes: patchEnvelopes
	    })
	    await workerTelemetry(agentRoot, intake, agent, slice, {
	      eventType: 'patch_candidate',
	      status: 'running',
	      backend,
	      serviceTier: policy.service_tier,
	      artifacts: [patchRel],
	      logTail: `patch envelopes ${patchEnvelopes.length}`
	    })
	  } else {
    noPatchReason = {
      schema: 'sks.native-cli-worker-no-patch-reason.v1',
      generated_at: nowIso(),
      ok: backend === 'fake' || !Array.isArray(slice.write_paths) || slice.write_paths.length === 0,
      reason: Array.isArray(slice.write_paths) && slice.write_paths.length ? 'write_capable_task_without_backend_patch_envelope' : 'read_only_or_no_write_paths',
      route_justification: Array.isArray(slice.write_paths) && slice.write_paths.length ? 'backend returned no patch envelopes for a write-capable task' : 'task has no write paths',
      read_only_or_noop_evidence: !Array.isArray(slice.write_paths) || slice.write_paths.length === 0,
      task_slice_id: slice.id || null,
      backend,
      blockers: Array.isArray(slice.write_paths) && slice.write_paths.length && backend !== 'fake' ? ['write_capable_no_patch_envelope'] : []
    }
	    await writeJsonAtomic(path.join(workerDir, 'worker-no-patch-reason.json'), noPatchReason)
	    await workerTelemetry(agentRoot, intake, agent, slice, {
	      eventType: 'artifact_written',
	      status: 'running',
	      backend,
	      serviceTier: policy.service_tier,
	      artifacts: [path.join(workerDirRel, 'worker-no-patch-reason.json')],
	      blockers: noPatchReason.blockers || [],
	      logTail: noPatchReason.reason
	    })
	  }
  const minRuntimeMs = Number(intake.min_runtime_ms || input.minRuntimeMs || 0)
  if (Number.isFinite(minRuntimeMs) && minRuntimeMs > 0) await delay(Math.min(30000, Math.floor(minRuntimeMs)))
  const report = {
    schema: 'sks.native-cli-worker-process-report.v1',
    generated_at: nowIso(),
    ok: guard.ok,
    backend,
    cwd: workerCwd,
    worktree,
    agent_id: agent.id,
    session_id: agent.session_id,
    slot_id: agent.slot_id || null,
    generation_index: agent.generation_index || null,
    pid: process.pid,
    ppid: process.ppid,
    process_id: process.pid,
    command_line: redactCommandLine(process.argv),
    fast_mode: policy.fast_mode,
    service_tier: policy.service_tier,
    sdk_thread_id: routed.report?.sdk_thread_id || null,
    sdk_run_id: routed.report?.sdk_run_id || null,
    stream_event_count: Number(routed.report?.stream_event_count || 0),
    structured_output_valid: routed.report?.structured_output_valid === true,
    backend_router_report: routed.report,
    backend_child_process_ids: routed.report.child_process_ids,
    backend_child_execution: routed.report.child_process_ids.length > 0 || Boolean(routed.report?.sdk_thread_id) || backend === 'fake' || backend === 'ollama',
    recursion_guard_env: process.env.SKS_DISABLE_ROUTE_RECURSION === '1',
    worker_env: process.env.SKS_AGENT_WORKER === '1',
    exit_code: guard.ok ? 0 : 1
  }
  await writeJsonAtomic(path.join(workerDir, 'worker-process-report.json'), report)
  const artifacts = [
    path.join(workerDirRel, 'worker-intake.json'),
    heartbeatRel,
    path.join(workerDirRel, 'worker-process-report.json'),
    routed.reportRel,
    ...routed.result.artifacts.filter((artifact: string) => artifact.includes('codex-worker-') || artifact.includes('agent-process-report') || artifact.includes('agent-zellij-report')),
    resultRel,
    patchEnvelopes.length ? patchRel : path.join(workerDirRel, 'worker-no-patch-reason.json'),
    path.join(workerDirRel, 'worker-terminal-close-report.json'),
    path.join(workerDirRel, 'worker-fast-mode.json'),
    path.join(workerDirRel, 'worker-recursion-guard.json'),
    path.join(workerDirRel, 'worker-session-proof.json')
  ]
  const result = validateAgentWorkerResult({
    ...routed.result,
    mission_id: String(intake.mission_id || input.missionId || ''),
    agent_id: String(agent.id || agent.slot_id || 'worker'),
    session_id: String(agent.session_id || ''),
    persona_id: String(agent.persona_id || agent.id || 'worker'),
    task_slice_id: String(slice.id || ''),
    status: guard.ok && routed.result.status === 'done' ? 'done' : routed.result.status === 'failed' ? 'failed' : 'blocked',
    backend,
    summary: routed.result.summary || `Native CLI worker ${agent.slot_id || agent.id || 'worker'} gen-${agent.generation_index || 1} completed ${slice.id || 'work-item'}.`,
    findings: [...(routed.result.findings || []), 'native CLI worker process executed as child session', 'native worker backend router executed'],
    proposed_changes: routed.result.proposed_changes || [],
    changed_files: routed.result.changed_files || [],
    lease_compliance: routed.result.lease_compliance || { ok: true, violations: [] },
    artifacts,
    blockers: [...(routed.result.blockers || []), ...(noPatchReason?.blockers || []), ...(guard.ok ? [] : ['native_cli_worker_recursion_guard_missing'])],
    confidence: routed.result.confidence || (backend === 'fake' ? 'fixture' : 'verified_partial'),
    handoff_notes: 'Worker exited after writing native CLI session artifacts.',
    unverified: routed.result.unverified || (backend === 'fake' ? ['fixture backend does not prove model-authored code changes'] : []),
    writes: routed.result.writes || [],
    ...(patchEnvelopes.length ? { patch_envelopes: patchEnvelopes } : {}),
    backend_router_report: routed.report,
    codex_child_report: routed.result.codex_child_report,
    codex_sdk_thread: routed.result.codex_sdk_thread,
    process_child_report: routed.result.process_child_report,
    zellij_child_report: routed.result.zellij_child_report,
    model_authored_patch_envelopes: patchEnvelopes.some((envelope: any) => envelope.source === 'model_authored'),
    fixture_patch_envelopes: patchEnvelopes.some((envelope: any) => envelope.source === 'fixture'),
    ...(!patchEnvelopes.length ? { no_patch_reason: noPatchReason || await readJson(path.join(workerDir, 'worker-no-patch-reason.json'), null) } : {}),
    source_intelligence_refs: agent.source_intelligence_refs || intake.source_intelligence_refs || null,
    goal_mode_ref: agent.goal_mode_ref || intake.goal_mode_ref || null,
    verification: { status: guard.ok && routed.result.status === 'done' ? 'passed' : 'failed', checks: [...(routed.result.verification?.checks || []), 'native-cli-worker-process', 'worker-artifact-contract', 'fast-mode-policy', 'native-worker-backend-router'] },
    recursion_guard: { ok: guard.ok, violations: guard.violations }
  })
	  await writeJsonAtomic(path.resolve(agentRoot, resultRel), result)
	  await workerTelemetry(agentRoot, intake, agent, slice, {
	    eventType: result.status === 'done' ? 'worker_completed' : 'worker_failed',
	    status: result.status === 'done' ? 'completed' : 'failed',
	    backend,
	    serviceTier: policy.service_tier,
	    artifacts: result.artifacts || [],
	    blockers: result.blockers || [],
	    logTail: result.summary || ''
	  })
  await writeJsonAtomic(path.join(workerDir, 'worker-session-proof.json'), {
    schema: 'sks.native-cli-worker-session-proof.v1',
    generated_at: nowIso(),
    ok: result.status === 'done',
    session_id: result.session_id,
    slot_id: agent.slot_id || null,
    generation_index: agent.generation_index || null,
    process_id: process.pid,
    main_repo_root: String(input.mainRepoRoot || intake.main_repo_root || worktree?.main_repo_root || agentRoot),
    cwd: workerCwd,
    worktree,
    artifact_dir: workerDirRel,
    patch_envelope: patchEnvelopes.length ? patchRel : null,
    no_patch_reason: patchEnvelopes.length ? null : path.join(workerDirRel, 'worker-no-patch-reason.json'),
    backend_router_report: routed.reportRel,
    backend_child_process_ids: routed.report.child_process_ids,
    sdk_thread_id: routed.report?.sdk_thread_id || null,
    sdk_run_id: routed.report?.sdk_run_id || null,
    stream_event_count: Number(routed.report?.stream_event_count || 0),
    structured_output_valid: routed.report?.structured_output_valid === true,
    model_authored_patch_envelopes: patchEnvelopes.some((envelope: any) => envelope.source === 'model_authored'),
    fixture_patch_envelopes: patchEnvelopes.some((envelope: any) => envelope.source === 'fixture'),
    fast_mode: policy.fast_mode,
    service_tier: policy.service_tier,
    blockers: result.blockers
  })
	  await appendJsonl(path.resolve(agentRoot, heartbeatRel), {
    schema: 'sks.native-cli-worker-heartbeat.v1',
    ts: nowIso(),
    event: 'finished',
    pid: process.pid,
    session_id: agent.session_id,
	    status: result.status
	  })
	  await workerTelemetry(agentRoot, intake, agent, slice, {
	    eventType: 'heartbeat',
	    status: result.status === 'done' ? 'completed' : 'failed',
	    backend,
	    serviceTier: policy.service_tier,
	    artifacts: [heartbeatRel, resultRel],
	    blockers: result.blockers || [],
	    logTail: 'worker heartbeat finished'
	  })
  await writeJsonAtomic(path.join(workerDir, 'worker-terminal-close-report.json'), {
    schema: 'sks.native-cli-worker-terminal-close-report.v1',
    generated_at: nowIso(),
    ok: result.status === 'done',
    session_id: result.session_id,
    slot_id: agent.slot_id || null,
    generation_index: agent.generation_index || null,
    process_id: process.pid,
    exit_code: result.status === 'done' ? 0 : 1,
    fast_mode: policy.fast_mode,
    service_tier: policy.service_tier,
    blockers: result.blockers
  })
  return result
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseNativeCliWorkerArgs(args: string[]) {
  return {
    intake: readOption(args, '--intake', ''),
    json: args.includes('--json'),
    backend: readOption(args, '--backend', ''),
    agentRoot: readOption(args, '--agent-root', ''),
    artifactDir: readOption(args, '--artifact-dir', ''),
    resultPath: readOption(args, '--result-path', ''),
    heartbeatPath: readOption(args, '--heartbeat-path', ''),
    patchEnvelopePath: readOption(args, '--patch-envelope-path', ''),
    serviceTier: readOption(args, '--service-tier', ''),
    fastMode: args.includes('--no-fast') ? false : args.includes('--fast') ? true : undefined
  }
}

function readOption(args: string[], name: string, fallback: string) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return String(args[index + 1])
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='))
  return prefixed ? String(prefixed).slice(name.length + 1) : fallback
}

function redactCommandLine(argv: string[]) {
  return argv.map((part, index) => {
    if (index > 0 && /(?:key|token|secret|password)=/i.test(part)) return part.replace(/=.*/, '=<redacted>')
    return part
  })
}

function normalizeWorkerWorktree(value: any): {
  id: string
  path: string
  branch: string
  main_repo_root: string | null
} | null {
  const pathValue = value?.path || value?.worktree_path
  if (!pathValue) return null
  return {
    id: String(value?.id || value?.worktree_id || value?.slot_id || 'worktree'),
    path: String(pathValue),
    branch: String(value?.branch || 'unknown'),
    main_repo_root: value?.main_repo_root == null ? null : String(value.main_repo_root)
  }
}

async function workerTelemetry(agentRoot: string, intake: any, agent: any, slice: any, input: {
  eventType: ZellijSlotTelemetryEventType
  status: ZellijSlotTelemetryStatus
  backend: string
  serviceTier: string
  artifacts?: string[]
  blockers?: string[]
  logTail?: string
}) {
  const missionId = String(intake.mission_id || intake.parent_mission_id || '')
  if (!missionId) return
  await appendZellijSlotTelemetry(agentRoot, {
    schema: 'sks.zellij-slot-telemetry-event.v1',
    ts: nowIso(),
    mission_id: missionId,
    slot_id: String(agent.slot_id || agent.id || 'slot-001'),
    generation_index: Number(agent.generation_index || 1),
    worker_id: String(agent.id || agent.slot_id || 'worker'),
    event_type: input.eventType,
    status: input.status,
    role: String(agent.naruto_role || agent.role || agent.persona_id || agent.id || 'worker'),
    backend: input.backend,
    service_tier: input.serviceTier,
    worktree_id: agent.worktree?.id || slice.worktree?.id || intake.worktree?.id || null,
    worktree_path: agent.worktree?.path || slice.worktree?.path || intake.worktree?.path || null,
    task_title: String(slice.description || slice.title || slice.id || 'worker task'),
    current_file: firstString([slice.write_paths?.[0], slice.readonly_paths?.[0], slice.input_files?.[0]]) || null,
    artifact_paths: input.artifacts || [],
    log_tail: input.logTail || '',
    blockers: input.blockers || []
  }).catch(() => undefined)
}

function firstString(values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return null
}

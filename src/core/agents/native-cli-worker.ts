import path from 'node:path'
import { ensureDir, nowIso, readJson, writeJsonAtomic, appendJsonl } from '../fsx.js'
import { buildFixturePatchEnvelopes } from './agent-runner-fake.js'
import { scanAgentTextForRecursion } from './agent-recursion-guard.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'
import { resolveFastModePolicy } from './fast-mode-policy.js'

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
    worker_artifact_dir: workerDirRel,
    result_path: resultRel,
    heartbeat_path: heartbeatRel,
    patch_envelope_path: patchRel,
    backend,
    service_tier: policy.service_tier,
    fast_mode: policy.fast_mode,
    source_intelligence_refs: agent.source_intelligence_refs || intake.source_intelligence_refs || null,
    goal_mode_ref: agent.goal_mode_ref || intake.goal_mode_ref || null,
    strategy_refs: slice.strategy_refs || intake.strategy_refs || null,
    no_recursive_orchestrator_guard: guard.ok
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
  const patchEnvelopes = buildFixturePatchEnvelopes(agent, slice, {
    missionId: intake.mission_id || input.missionId || intake.parent_mission_id || '',
    route: intake.route || input.route || '$Agent',
    fastMode: policy.fast_mode,
    serviceTier: policy.service_tier,
    nativeCliWorkerSessionId: agent.session_id,
    nativeCliProcessId: process.pid
  })
  if (patchEnvelopes.length) {
    await writeJsonAtomic(path.resolve(agentRoot, patchRel), {
      schema: 'sks.native-cli-worker-patch-envelope.v1',
      generated_at: nowIso(),
      ok: true,
      envelope_count: patchEnvelopes.length,
      envelopes: patchEnvelopes
    })
  } else {
    await writeJsonAtomic(path.join(workerDir, 'worker-no-patch-reason.json'), {
      schema: 'sks.native-cli-worker-no-patch-reason.v1',
      generated_at: nowIso(),
      ok: true,
      reason: Array.isArray(slice.write_paths) && slice.write_paths.length ? 'write_paths_filtered_or_no_fixture_patch' : 'read_only_or_no_write_paths',
      task_slice_id: slice.id || null
    })
  }
  const minRuntimeMs = Number(intake.min_runtime_ms || input.minRuntimeMs || 0)
  if (Number.isFinite(minRuntimeMs) && minRuntimeMs > 0) await delay(Math.min(30000, Math.floor(minRuntimeMs)))
  const report = {
    schema: 'sks.native-cli-worker-process-report.v1',
    generated_at: nowIso(),
    ok: guard.ok,
    backend,
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
    recursion_guard_env: process.env.SKS_DISABLE_ROUTE_RECURSION === '1',
    worker_env: process.env.SKS_AGENT_WORKER === '1',
    exit_code: guard.ok ? 0 : 1
  }
  await writeJsonAtomic(path.join(workerDir, 'worker-process-report.json'), report)
  const artifacts = [
    path.join(workerDirRel, 'worker-intake.json'),
    heartbeatRel,
    path.join(workerDirRel, 'worker-process-report.json'),
    resultRel,
    patchEnvelopes.length ? patchRel : path.join(workerDirRel, 'worker-no-patch-reason.json'),
    path.join(workerDirRel, 'worker-terminal-close-report.json'),
    path.join(workerDirRel, 'worker-fast-mode.json'),
    path.join(workerDirRel, 'worker-recursion-guard.json'),
    path.join(workerDirRel, 'worker-session-proof.json')
  ]
  const result = validateAgentWorkerResult({
    mission_id: String(intake.mission_id || input.missionId || ''),
    agent_id: String(agent.id || agent.slot_id || 'worker'),
    session_id: String(agent.session_id || ''),
    persona_id: String(agent.persona_id || agent.id || 'worker'),
    task_slice_id: String(slice.id || ''),
    status: guard.ok ? 'done' : 'blocked',
    backend,
    summary: `Native CLI worker ${agent.slot_id || agent.id || 'worker'} gen-${agent.generation_index || 1} completed ${slice.id || 'work-item'}.`,
    findings: ['native CLI worker process executed as child session'],
    proposed_changes: [],
    changed_files: [],
    lease_compliance: { ok: true, violations: [] },
    artifacts,
    blockers: guard.ok ? [] : ['native_cli_worker_recursion_guard_missing'],
    confidence: backend === 'fake' ? 'fixture' : 'verified_partial',
    handoff_notes: 'Worker exited after writing native CLI session artifacts.',
    unverified: backend === 'fake' ? ['fixture backend does not prove model-authored code changes'] : [],
    writes: [],
    ...(patchEnvelopes.length ? { patch_envelopes: patchEnvelopes } : {}),
    source_intelligence_refs: agent.source_intelligence_refs || intake.source_intelligence_refs || null,
    goal_mode_ref: agent.goal_mode_ref || intake.goal_mode_ref || null,
    verification: { status: guard.ok ? 'passed' : 'failed', checks: ['native-cli-worker-process', 'worker-artifact-contract', 'fast-mode-policy'] },
    recursion_guard: { ok: guard.ok, violations: guard.violations }
  })
  await writeJsonAtomic(path.resolve(agentRoot, resultRel), result)
  await writeJsonAtomic(path.join(workerDir, 'worker-session-proof.json'), {
    schema: 'sks.native-cli-worker-session-proof.v1',
    generated_at: nowIso(),
    ok: result.status === 'done',
    session_id: result.session_id,
    slot_id: agent.slot_id || null,
    generation_index: agent.generation_index || null,
    process_id: process.pid,
    artifact_dir: workerDirRel,
    patch_envelope: patchEnvelopes.length ? patchRel : null,
    no_patch_reason: patchEnvelopes.length ? null : path.join(workerDirRel, 'worker-no-patch-reason.json'),
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

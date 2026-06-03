import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { buildFixturePatchEnvelopes } from './agent-runner-fake.js'
import { runProcessAgent } from './agent-runner-process.js'
import { runZellijAgent } from './agent-runner-zellij.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'
import { normalizeAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'
import { runCodexTask } from '../codex-control/codex-control-plane.js'
import { CODEX_AGENT_WORKER_RESULT_SCHEMA_ID, codexAgentWorkerResultSchema } from '../codex-control/schemas/agent-worker-result.schema.js'

export const NATIVE_WORKER_BACKEND_ROUTER_SCHEMA = 'sks.native-worker-backend-router.v1'

type BackendSource = 'fixture' | 'process_generated' | 'model_authored' | 'zellij_generated'

export async function runNativeWorkerBackendRouter(input: {
  agentRoot: string
  workerDirRel: string
  resultRel: string
  patchRel: string
  agent: any
  slice: any
  intake: any
  backend: string
  fastModePolicy: { fast_mode: boolean; service_tier: 'fast' | 'standard' }
  guard: any
}) {
  const root = path.resolve(input.agentRoot)
  const requestedBackend = String(input.backend || '')
  const backend = normalizeBackend(requestedBackend)
  const reportRel = path.join(input.workerDirRel, 'worker-backend-router-report.json')
  const startedAt = nowIso()
  let result: any
  let childReports: any[] = []
  let patchEnvelopes: AgentPatchEnvelope[] = []
  let proofLevel = 'blocked'
  let outputLastMessagePath: string | null = null

  if (!input.guard?.ok) {
    result = validateAgentWorkerResult(blockedResult(input, ['native_cli_worker_recursion_guard_missing']))
  } else if (requestedBackend === 'codex-exec') {
    result = validateAgentWorkerResult(blockedResult(input, ['legacy_codex_exec_runtime_removed']))
  } else if (!backend) {
    result = validateAgentWorkerResult(blockedResult(input, ['native_worker_backend_unknown']))
  } else if (backend === 'fake') {
    patchEnvelopes = buildFixturePatchEnvelopes(input.agent, input.slice, envelopeOpts(input, 'fixture'))
    proofLevel = 'fixture_only'
    result = validateAgentWorkerResult(baseResult(input, backend, patchEnvelopes, {
      summary: 'Fake backend generated fixture patch envelopes.',
      confidence: 'fixture',
      unverified: ['fixture backend does not prove real Codex execution']
    }))
  } else if (backend === 'process') {
    const processRun = await runProcessAgent(input.agent, input.slice, {
      missionId: input.intake.mission_id || input.intake.parent_mission_id || '',
      agentRoot: root,
      cwd: input.intake.cwd || root,
      command: Array.isArray(input.intake.process_command) ? input.intake.process_command.map(String) : defaultProcessCommand(input),
      fastMode: input.fastModePolicy.fast_mode,
      serviceTier: input.fastModePolicy.service_tier
    })
    const processReportRel = processRun.artifacts.find((artifact: string) => artifact.endsWith('agent-process-report.json')) || null
    const processReport = processReportRel ? await readJson<any>(path.join(root, processReportRel), null) : null
    childReports = processReport ? [processReport] : []
    patchEnvelopes = buildGeneratedPatchEnvelopes(input, 'process_generated', Number(processReport?.pid))
    proofLevel = processReport?.pid ? 'process_child_proven' : 'verified_partial'
    result = validateAgentWorkerResult({
      ...processRun,
      patch_envelopes: patchEnvelopes,
      artifacts: [...new Set([...(processRun.artifacts || []), ...(patchEnvelopes.length ? [input.patchRel] : [])])],
      process_child_report: processReport,
      model_authored_patch_envelopes: false,
      fixture_patch_envelopes: false,
      verification: { status: processRun.status === 'done' ? 'passed' : 'failed', checks: [...(processRun.verification?.checks || []), 'native-worker-backend-router', 'process-child-execution'] }
    })
  } else if (backend === 'codex-sdk' || backend === 'zellij') {
    const sdkTask = await runCodexTask({
      route: String(input.intake.route || '$Agent'),
      missionId: String(input.intake.mission_id || input.intake.parent_mission_id || ''),
      workItemId: String(input.slice?.id || ''),
      slotId: String(input.agent.slot_id || input.agent.id || ''),
      generationIndex: Number(input.agent.generation_index || 1),
      sessionId: String(input.agent.session_id || ''),
      cwd: String(input.intake.cwd || root),
      prompt: buildWorkerPrompt(input.slice),
      inputFiles: input.intake.input_files || [],
      inputImages: input.intake.input_images || [],
      outputSchemaId: CODEX_AGENT_WORKER_RESULT_SCHEMA_ID,
      outputSchema: codexAgentWorkerResultSchema as Record<string, unknown>,
      sandboxPolicy: hasWriteLease(input.slice, input.intake) ? 'workspace-write' : 'read-only',
      requestedScopeContract: {
        id: String(input.intake.lease_id || input.slice?.id || ''),
        route: String(input.intake.route || '$Agent'),
        read_only: !hasWriteLease(input.slice, input.intake),
        allowed_paths: writePaths(input.slice, input.intake),
        write_paths: writePaths(input.slice, input.intake),
        user_confirmed_full_access: false,
        mad_sks_authorized: input.intake.mad_sks_authorized === true || process.env.SKS_MAD_SKS_ACTIVE === '1'
      },
      mutationLedgerRoot: path.join(root, input.workerDirRel),
      zellijPaneId: await readZellijPaneId(root, input.workerDirRel)
    })
    outputLastMessagePath = sdkTask.workerResultPath
    const sdkWorkerResult = await readJson<any>(sdkTask.workerResultPath, null)
    patchEnvelopes = normalizeSdkPatchEnvelopes(sdkWorkerResult?.patch_envelopes || [], input, sdkTask.sdkThreadId)
    proofLevel = sdkTask.ok ? (patchEnvelopes.length ? 'model_authored' : 'codex_sdk_thread_proven') : 'blocked'
    const sdkReport = {
      schema: 'sks.codex-sdk-worker-adapter.v1',
      backend: 'codex-sdk',
      sdk_thread_id: sdkTask.sdkThreadId,
      sdk_run_id: sdkTask.sdkRunId,
      stream_event_count: sdkTask.streamEventCount,
      structured_output_valid: sdkTask.structuredOutputValid,
      worker_result_path: sdkTask.workerResultPath,
      patch_envelope_path: sdkTask.patchEnvelopePath || null,
      blockers: sdkTask.blockers
    }
    childReports = [sdkReport]
    result = validateAgentWorkerResult({
      ...sdkWorkerResult,
      backend: 'codex-sdk',
      patch_envelopes: patchEnvelopes,
      codex_child_report: sdkReport,
      codex_sdk_thread: sdkReport,
      model_authored_patch_envelopes: patchEnvelopes.length > 0,
      fixture_patch_envelopes: false,
      artifacts: [...new Set([...(sdkWorkerResult?.artifacts || []), path.relative(root, sdkTask.workerResultPath), path.join(input.workerDirRel, 'codex-control-proof.json'), path.join(input.workerDirRel, 'codex-thread-registry.json'), path.join(input.workerDirRel, 'codex-sdk-events.jsonl')])],
      blockers: [...(sdkWorkerResult?.blockers || []), ...sdkTask.blockers],
      verification: {
        status: sdkTask.ok ? 'passed' : 'failed',
        checks: [...(sdkWorkerResult?.verification?.checks || []), 'codex-sdk-control-plane', 'codex-sdk-event-stream', 'codex-sdk-structured-output']
      }
    })
  } else {
    const zellijRun = await runZellijAgent(input.agent, input.slice, {
      missionId: input.intake.mission_id || input.intake.parent_mission_id || '',
      agentRoot: root,
      cwd: input.intake.cwd || root,
      real: input.intake.real_zellij === true || input.intake.real === true,
      fastMode: input.fastModePolicy.fast_mode,
      serviceTier: input.fastModePolicy.service_tier
    })
    const zellijReportRel = zellijRun.artifacts.find((artifact: string) => artifact.endsWith('agent-zellij-report.json')) || null
    const zellijReport = zellijReportRel ? await readJson<any>(path.join(root, zellijReportRel), null) : null
    childReports = zellijReport ? [zellijReport] : []
    patchEnvelopes = buildGeneratedPatchEnvelopes(input, 'zellij_generated')
    proofLevel = zellijReport?.launch_mode === 'real_zellij' ? 'zellij_child_proven' : 'fixture_only'
    result = validateAgentWorkerResult({
      ...zellijRun,
      patch_envelopes: patchEnvelopes,
      zellij_child_report: zellijReport,
      model_authored_patch_envelopes: false,
      fixture_patch_envelopes: false,
      verification: { status: zellijRun.status === 'done' ? 'passed' : 'failed', checks: [...(zellijRun.verification?.checks || []), 'native-worker-backend-router', 'zellij-child-execution'] }
    })
  }

  const report = {
    schema: NATIVE_WORKER_BACKEND_ROUTER_SCHEMA,
    generated_at: nowIso(),
    started_at: startedAt,
    finished_at: nowIso(),
    ok: result.status === 'done',
    selected_backend: backend || input.backend,
    agent_id: input.agent.id,
    session_id: input.agent.session_id,
    worker_process_id: process.pid,
    child_process_ids: childReports.map((report) => Number(report?.pid || report?.codex_child_pid)).filter((pid) => Number.isFinite(pid)),
    output_last_message_path: outputLastMessagePath,
    patch_envelope_count: patchEnvelopes.length,
      model_authored_patch_envelopes: patchEnvelopes.some((envelope: AgentPatchEnvelope) => envelope.source === 'model_authored'),
      fixture_patch_envelopes: patchEnvelopes.some((envelope: AgentPatchEnvelope) => envelope.source === 'fixture'),
    proof_level: proofLevel,
    fast_mode: input.fastModePolicy.fast_mode,
    service_tier: input.fastModePolicy.service_tier,
    sdk_thread_id: childReports.find((report) => report?.sdk_thread_id)?.sdk_thread_id || null,
    sdk_run_id: childReports.find((report) => report?.sdk_run_id)?.sdk_run_id || null,
    stream_event_count: Number(childReports.find((report) => report?.stream_event_count)?.stream_event_count || 0),
    structured_output_valid: childReports.some((report) => report?.structured_output_valid === true),
    blockers: result.blockers || []
  }
  await writeJsonAtomic(path.join(root, reportRel), report)
  return {
    result: validateAgentWorkerResult({
      ...result,
      backend_router_report: report,
      artifacts: [...new Set([...(result.artifacts || []), reportRel])]
    }),
    report,
    reportRel,
    patchEnvelopes
  }
}

function normalizeBackend(value: string): 'fake' | 'process' | 'codex-sdk' | 'zellij' | null {
  return value === 'fake' || value === 'process' || value === 'codex-sdk' || value === 'zellij' ? value : null
}

function envelopeOpts(input: any, source: BackendSource, childPid?: number) {
  return {
    missionId: input.intake.mission_id || input.intake.parent_mission_id || '',
    route: input.intake.route || '$Agent',
    fastMode: input.fastModePolicy.fast_mode,
    serviceTier: input.fastModePolicy.service_tier,
    nativeCliWorkerSessionId: input.agent.session_id,
    nativeCliProcessId: process.pid,
    workerProcessId: process.pid,
    source,
    ...(childPid === undefined ? {} : { backendChildProcessId: childPid })
  }
}

function buildGeneratedPatchEnvelopes(input: any, source: BackendSource, childPid?: number) {
  return buildFixturePatchEnvelopes(input.agent, input.slice, envelopeOpts(input, source, childPid)).map((envelope: AgentPatchEnvelope) => normalizeAgentPatchEnvelope({
    ...envelope,
    source,
    worker_process_id: process.pid,
    ...(childPid === undefined ? {} : { backend_child_process_id: childPid })
  }))
}

function buildWorkerPrompt(slice: any) {
  const write = writePaths(slice, {})
  return [
    String(slice?.description || slice?.title || 'Complete the assigned worker task.'),
    '',
    write.length
      ? `Write-capable slice. Return JSON matching ${CODEX_AGENT_WORKER_RESULT_SCHEMA_ID}; include patch_envelopes for write_paths=${JSON.stringify(write)}.`
      : `Read-only slice. Return JSON matching ${CODEX_AGENT_WORKER_RESULT_SCHEMA_ID}.`,
    'Required JSON fields: status, summary, findings, changed_files, patch_envelopes, verification, rollback_notes, blockers.'
  ].join('\n')
}

function hasWriteLease(slice: any, intake: any) {
  return writePaths(slice, intake).length > 0
}

function writePaths(slice: any, intake: any) {
  return [
    ...(Array.isArray(slice?.write_paths) ? slice.write_paths : []),
    ...(Array.isArray(intake?.write_paths) ? intake.write_paths : [])
  ].map(String).filter(Boolean)
}

async function readZellijPaneId(root: string, workerDirRel: string) {
  const pane = await readJson<any>(path.join(root, workerDirRel, 'zellij-worker-pane.json'), null)
  return pane?.pane_id ? String(pane.pane_id) : null
}

function normalizeSdkPatchEnvelopes(envelopes: AgentPatchEnvelope[], input: any, sdkThreadId: string) {
  return envelopes.map((envelope) => normalizeAgentPatchEnvelope({
    ...envelope,
    source: 'model_authored',
    native_cli_worker_session_id: input.agent.session_id,
    native_cli_process_id: process.pid,
    worker_process_id: process.pid,
    backend_sdk_thread_id: sdkThreadId,
    fast_mode: input.fastModePolicy.fast_mode,
    service_tier: input.fastModePolicy.service_tier
  }))
}

function defaultProcessCommand(input: any) {
  return [
    process.execPath,
    '-e',
    `console.log(${JSON.stringify(`sks process backend worker ${input.agent.session_id || input.agent.id} completed ${input.slice?.id || 'task'}`)})`
  ]
}

function baseResult(input: any, backend: string, patchEnvelopes: AgentPatchEnvelope[], extra: any = {}) {
  return {
    mission_id: input.intake.mission_id || input.intake.parent_mission_id || '',
    agent_id: input.agent.id,
    session_id: input.agent.session_id,
    persona_id: input.agent.persona_id || input.agent.id,
    task_slice_id: input.slice?.id || '',
    status: 'done',
    backend,
    summary: extra.summary || `Native worker backend ${backend} completed.`,
    findings: [`native worker backend ${backend} executed`],
    proposed_changes: [],
    changed_files: [],
    lease_compliance: { ok: true, violations: [] },
    artifacts: [],
    blockers: [],
    confidence: extra.confidence || 'verified_partial',
    handoff_notes: 'Backend router returned worker result.',
    unverified: extra.unverified || [],
    writes: [],
    patch_envelopes: patchEnvelopes,
    model_authored_patch_envelopes: patchEnvelopes.some((envelope) => envelope.source === 'model_authored'),
    fixture_patch_envelopes: patchEnvelopes.some((envelope) => envelope.source === 'fixture'),
    source_intelligence_refs: input.agent.source_intelligence_refs || input.intake.source_intelligence_refs || null,
    goal_mode_ref: input.agent.goal_mode_ref || input.intake.goal_mode_ref || null,
    verification: { status: 'passed', checks: ['native-worker-backend-router'] },
    recursion_guard: { ok: true, violations: [] }
  }
}

function blockedResult(input: any, blockers: string[]) {
  return {
    ...baseResult(input, String(input.backend || 'unknown'), [], { summary: 'Native worker backend router blocked.', confidence: 'blocked' }),
    status: 'blocked',
    blockers
  }
}

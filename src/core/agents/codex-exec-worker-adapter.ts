import path from 'node:path'
import { exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { runCodexExecAgent, buildCodexExecAgentArgs } from './agent-runner-codex-exec.js'
import { normalizeAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'

export const CODEX_EXEC_WORKER_ADAPTER_SCHEMA = 'sks.codex-exec-worker-adapter.v1'

export async function runCodexExecWorkerAdapter(input: {
  agentRoot: string
  workerDirRel: string
  agent: any
  slice: any
  intake?: any
  fastModePolicy: { fast_mode: boolean; service_tier: 'fast' | 'standard' }
  outputSchemaFile?: string
  resultFile?: string
  real?: boolean
}) {
  const root = path.resolve(input.agentRoot)
  const workerDir = path.resolve(root, input.workerDirRel)
  const codexResultFile = input.resultFile || path.join(workerDir, 'codex-output-last-message.json')
  const command = buildCodexExecAgentArgs(input.agent, buildWorkerPrompt(input.slice), {
    cwd: input.intake?.cwd || root,
    agentRoot: root,
    resultFile: codexResultFile,
    schemaFile: input.outputSchemaFile,
    profile: input.intake?.profile || null,
    workspaceWrite: hasWriteLease(input.slice, input.intake),
    fastMode: input.fastModePolicy.fast_mode,
    serviceTier: input.fastModePolicy.service_tier
  })
  const startedAt = nowIso()
  const result = await runCodexExecAgent(input.agent, input.slice, {
    missionId: input.intake?.mission_id || input.intake?.parent_mission_id || '',
    agentRoot: root,
    cwd: input.intake?.cwd || root,
    prompt: buildWorkerPrompt(input.slice),
    resultFile: codexResultFile,
    schemaFile: input.outputSchemaFile,
    profile: input.intake?.profile || null,
    workspaceWrite: hasWriteLease(input.slice, input.intake),
    fastMode: input.fastModePolicy.fast_mode,
    serviceTier: input.fastModePolicy.service_tier,
    dryRun: input.real === true ? false : true,
    env: {
      SKS_AGENT_WORKER: '1',
      SKS_PIPELINE_MODE: 'agent-worker',
      SKS_DISABLE_ROUTE_RECURSION: '1'
    }
  })
  const finishedAt = nowIso()
  const reportRel = path.join(input.workerDirRel, 'codex-worker-process-report.json')
  const outputTruthRel = path.join(input.workerDirRel, 'codex-worker-output-truth.json')
  const rawReportRel = result.artifacts.find((artifact: string) => artifact.endsWith('agent-process-report.json')) || null
  const rawReport = rawReportRel ? await readJson<any>(path.join(root, rawReportRel), null) : null
  const childPid = Number(rawReport?.pid)
  const outputLastMessageExists = await exists(codexResultFile)
  const outputJson = outputLastMessageExists ? await readJson<any>(codexResultFile, null) : null
  const patchEnvelopes = normalizeModelAuthoredEnvelopes(result.patch_envelopes || [], input, Number.isFinite(childPid) ? childPid : undefined)
  const syntheticFallback = result.unverified?.some((entry: string) => /stdout fallback/i.test(String(entry))) === true
  const processReport = {
    schema: CODEX_EXEC_WORKER_ADAPTER_SCHEMA,
    generated_at: nowIso(),
    backend: 'codex-exec',
    agent_id: input.agent.id,
    session_id: input.agent.session_id,
    command: [input.intake?.codex_bin || 'codex', ...command.args],
    codex_child_pid: Number.isFinite(childPid) ? childPid : null,
    codex_child_started_at: rawReport?.dry_run ? null : startedAt,
    codex_child_finished_at: rawReport?.dry_run ? null : finishedAt,
    output_last_message_path: codexResultFile,
    output_schema_file: input.outputSchemaFile || null,
    fast_mode: input.fastModePolicy.fast_mode,
    service_tier: input.fastModePolicy.service_tier,
    service_tier_passed_to_codex: command.args.includes('-c') && command.args.includes(`service_tier=${input.fastModePolicy.service_tier}`),
    managed_proxy_env_keys: rawReport?.managed_proxy_env_keys || [],
    recursion_guard_env: rawReport?.recursion_guard_env === true,
    dry_run: rawReport?.dry_run !== false,
    exit_code: rawReport?.exit_code ?? null,
    synthetic_stdout_fallback: syntheticFallback,
    patch_envelope_count: patchEnvelopes.length,
    model_authored_patch_envelopes: patchEnvelopes.length > 0,
    blockers: [
      ...(syntheticFallback ? ['codex_exec_synthetic_stdout_fallback'] : []),
      ...(input.real === true && !outputLastMessageExists ? ['codex_exec_output_last_message_missing'] : [])
    ]
  }
  const outputTruth = {
    schema: 'sks.codex-worker-output-truth.v1',
    generated_at: nowIso(),
    ok: outputLastMessageExists && Boolean(outputJson) && !syntheticFallback,
    output_last_message_path: codexResultFile,
    output_last_message_exists: outputLastMessageExists,
    output_last_message_json_parsed: Boolean(outputJson),
    patch_envelope_count: patchEnvelopes.length,
    model_authored_patch_envelopes: patchEnvelopes.length > 0,
    synthetic_stdout_fallback: syntheticFallback,
    blockers: processReport.blockers
  }
  await writeJsonAtomic(path.join(root, reportRel), processReport)
  await writeJsonAtomic(path.join(root, outputTruthRel), outputTruth)
  return {
    result: {
      ...result,
      patch_envelopes: patchEnvelopes,
      artifacts: [...new Set([...(result.artifacts || []), reportRel, outputTruthRel])],
      codex_child_report: processReport,
      model_authored_patch_envelopes: patchEnvelopes.length > 0,
      fixture_patch_envelopes: false,
      blockers: [...(result.blockers || []), ...processReport.blockers]
    },
    processReport,
    outputTruth,
    patchEnvelopes,
    reportRel,
    outputTruthRel
  }
}

function buildWorkerPrompt(slice: any) {
  const writePaths = Array.isArray(slice?.write_paths) ? slice.write_paths.map(String).filter(Boolean) : []
  const patchContract = writePaths.length
    ? [
        `Write-capable slice. write_paths=${JSON.stringify(writePaths)}.`,
        'Return at least one patch_envelopes item with source "model_authored".',
        `Use a write operation for ${JSON.stringify(writePaths[0])}, allowed_paths equal to write_paths, lease_proof.protected_path_check "passed", and non-empty verification_hint and rollback_hint.`,
        'For patch envelope runtime ids you cannot know yet, use numeric 0 or empty strings; SKS will bind actual worker and Codex child process ids from the process report.',
        'Set changed_files and writes consistently with the patch envelope operation.'
      ].join('\n')
    : 'Read-only slice. Return patch_envelopes only if you are explicitly proposing a leased patch.'
  return [
    String(slice?.description || slice?.title || 'Complete the assigned worker task.'),
    '',
    patchContract,
    '',
    'Return only JSON matching the SKS agent result schema.',
    'Set patch_queue_refs, applied_patch_refs, rollback_refs, follow_up_work_items, artifacts, blockers, and unverified to arrays.',
    'Set backend_router_report, codex_child_report, process_child_report, tmux_child_report, and no_patch_reason to {} because SKS will bind runtime reports after your response.',
    'Set model_authored_patch_envelopes true when patch_envelopes is non-empty, fixture_patch_envelopes false, worker_scout_evidence null when no worker Scout evidence exists, and use null for source_intelligence_refs or goal_mode_ref unless concrete artifacts are provided.'
  ].join('\n')
}

function hasWriteLease(slice: any, intake: any) {
  return Array.isArray(slice?.write_paths) && slice.write_paths.length > 0 || Array.isArray(intake?.write_paths) && intake.write_paths.length > 0
}

function normalizeModelAuthoredEnvelopes(envelopes: AgentPatchEnvelope[], input: any, childPid?: number) {
  return envelopes.map((envelope) => normalizeAgentPatchEnvelope({
    ...envelope,
    source: 'model_authored',
    native_cli_worker_session_id: input.agent.session_id,
    native_cli_process_id: process.pid,
    worker_process_id: process.pid,
    ...(childPid === undefined ? {} : { backend_child_process_id: childPid }),
    fast_mode: input.fastModePolicy.fast_mode,
    service_tier: input.fastModePolicy.service_tier
  }))
}

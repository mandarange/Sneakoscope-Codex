#!/usr/bin/env node
import path from 'node:path'
import { appendJsonlBounded, ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { runCodexTask, type CodexControlBackend } from '../codex-control/codex-control-plane.js'
import { CODEX_AGENT_WORKER_RESULT_SCHEMA_ID, codexAgentWorkerResultSchema } from '../codex-control/schemas/agent-worker-result.schema.js'
import { normalizeWorkerPromptText } from './normalize-worker-prompt-text.js'

async function main() {
  const intakePath = process.argv[2]
  if (!intakePath) throw new Error('naruto worker intake path is required')
  const intake = await readJson<any>(intakePath, null)
  if (!intake?.result_path || !intake?.heartbeat_path || !intake?.item?.id) {
    throw new Error('naruto worker intake is invalid')
  }
  const startedAt = Date.now()
  const maxRuntimeMs = normalizeMaxRuntimeMs(intake.max_runtime_ms)
  let finished = false
  const heartbeatTimer = startDeadmanHeartbeat({ intake, startedAt, maxRuntimeMs, finished: () => finished })
  await appendJsonlBounded(intake.heartbeat_path, {
    schema: 'sks.naruto-actual-worker-heartbeat.v1',
    ts: nowIso(),
    item_id: intake.item.id,
    status: 'running',
    progress: null
  }, 2 * 1024 * 1024)
  if (intake.backend === 'fake') process.env.SKS_CODEX_SDK_FAKE = '1'
  const controlRoot = path.join(path.dirname(intake.result_path), 'codex-control')
  await ensureDir(controlRoot)
  try {
    const taskResult = await runCodexTask({
      route: '$Naruto',
      tier: 'worker',
      missionId: String(intake.mission_id || ''),
      workItemId: String(intake.item.id || ''),
      slotId: String(intake.item.id || ''),
      generationIndex: 1,
      sessionId: String(intake.item.id || ''),
      cwd: String(intake.worktree_path || process.cwd()),
      prompt: buildNarutoWorkerPrompt(intake.item, intake.parent_prompt),
      outputSchemaId: CODEX_AGENT_WORKER_RESULT_SCHEMA_ID,
      outputSchema: codexAgentWorkerResultSchema as Record<string, unknown>,
      sandboxPolicy: intake.item.write_allowed === true ? 'workspace-write' : 'read-only',
      requestedScopeContract: {
        id: `naruto:${intake.item.id}`,
        route: '$Naruto',
        read_only: intake.item.write_allowed !== true,
        allowed_paths: [...new Set([...(intake.item.target_paths || []), ...(intake.item.readonly_paths || []), ...(intake.item.write_paths || [])].map(String))],
        write_paths: Array.isArray(intake.item.write_paths) ? intake.item.write_paths.map(String) : [],
        user_confirmed_full_access: false,
        mad_sks_authorized: false
      },
      backendPreference: backendPreference(intake.backend),
      allowLocalLlm: intake.backend === 'ollama' || intake.backend === 'local-llm',
      ...(intake.backend === 'ollama' || intake.backend === 'local-llm' ? { localLlmPolicy: { mode: 'local_preferred' as const, requiresGptFinal: true } } : {}),
      mutationLedgerRoot: controlRoot,
      reliabilityPolicy: {
        maxEmptyResultRetries: 1,
        timeoutClass: 'short'
      }
    })
    const workerResult = await readJson<any>(taskResult.workerResultPath, null)
    const blockers = [...(taskResult.blockers || []), ...(Array.isArray(workerResult?.blockers) ? workerResult.blockers : [])]
    await writeJsonAtomic(intake.result_path, {
      schema: 'sks.naruto-actual-worker-result.v1',
      ok: taskResult.ok === true && blockers.length === 0,
      generated_at: nowIso(),
      item_id: intake.item.id,
      placement: intake.placement,
      backend: taskResult.backend,
      backend_family: taskResult.backend_family,
      worktree_path: intake.worktree_path,
      control_plane_result: {
        worker_result_path: taskResult.workerResultPath,
        patch_envelope_path: taskResult.patchEnvelopePath || null,
        stream_event_count: taskResult.streamEventCount,
        structured_output_valid: taskResult.structuredOutputValid,
        sdk_thread_id: taskResult.sdkThreadId,
        sdk_run_id: taskResult.sdkRunId || null
      },
      changed_files: Array.isArray(workerResult?.changed_files) ? workerResult.changed_files : [],
      parent_prompt_truncated: intake.parent_prompt_truncated === true,
      parent_prompt_dropped_chars: Number(intake.parent_prompt_dropped_chars || 0),
      blockers
    })
    finished = true
    clearInterval(heartbeatTimer)
    await appendJsonlBounded(intake.heartbeat_path, {
      schema: 'sks.naruto-actual-worker-heartbeat.v1',
      ts: nowIso(),
      item_id: intake.item.id,
      status: blockers.length ? 'blocked' : 'done',
      progress: { done: 1, total: 1 }
    }, 2 * 1024 * 1024)
  } catch (err: any) {
    finished = true
    clearInterval(heartbeatTimer)
    await writeJsonAtomic(intake.result_path, {
      schema: 'sks.naruto-actual-worker-result.v1',
      ok: false,
      generated_at: nowIso(),
      item_id: intake.item.id,
      placement: intake.placement,
      backend: intake.backend,
      worktree_path: intake.worktree_path,
      blockers: [`naruto_actual_worker_control_plane_exception:${err?.message || String(err)}`]
    })
    await appendJsonlBounded(intake.heartbeat_path, {
      schema: 'sks.naruto-actual-worker-heartbeat.v1',
      ts: nowIso(),
      item_id: intake.item.id,
      status: 'blocked',
      progress: null
    }, 2 * 1024 * 1024)
    throw err
  }
}

function startDeadmanHeartbeat(input: { intake: any; startedAt: number; maxRuntimeMs: number; finished: () => boolean }) {
  /* intentional: heartbeat/result writes below are best-effort — on timeout the process exits right after regardless, and the periodic running-heartbeat just retries next tick */
  const parsed = Number(process.env.SKS_ZELLIJ_WORKER_PROGRESS_MS || 10000)
  const intervalMs = Math.max(1000, Number.isFinite(parsed) ? Math.floor(parsed) : 10000)
  return setInterval(async () => {
    if (input.finished()) return
    const elapsedMs = Date.now() - input.startedAt
    if (elapsedMs > input.maxRuntimeMs) {
      await writeJsonAtomic(input.intake.result_path, {
        schema: 'sks.naruto-actual-worker-result.v1',
        ok: false,
        generated_at: nowIso(),
        item_id: input.intake.item.id,
        placement: input.intake.placement,
        backend: input.intake.backend,
        worktree_path: input.intake.worktree_path,
        status: 'timed_out',
        blockers: ['naruto_worker_hard_timeout']
      }).catch(() => undefined)
      await appendJsonlBounded(input.intake.heartbeat_path, {
        schema: 'sks.naruto-actual-worker-heartbeat.v1',
        ts: nowIso(),
        item_id: input.intake.item.id,
        status: 'timed_out',
        elapsed_ms: elapsedMs,
        progress: null
      }, 2 * 1024 * 1024).catch(() => undefined)
      process.exit(124)
      return
    }
    await appendJsonlBounded(input.intake.heartbeat_path, {
      schema: 'sks.naruto-actual-worker-heartbeat.v1',
      ts: nowIso(),
      item_id: input.intake.item.id,
      status: 'running',
      elapsed_ms: elapsedMs,
      progress: null
    }, 2 * 1024 * 1024).catch(() => undefined)
  }, intervalMs)
}

function normalizeMaxRuntimeMs(value: unknown) {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1000, Math.min(Math.floor(parsed), 24 * 60 * 60 * 1000))
  return 10 * 60 * 1000
}

function backendPreference(value: unknown): CodexControlBackend[] {
  const backend = String(value || '')
  if (backend === 'ollama' || backend === 'local-llm') return ['local-llm', 'codex-sdk']
  return ['codex-sdk']
}

function buildNarutoWorkerPrompt(item: any, parentPrompt?: string) {
  const writeAllowed = item?.write_allowed === true
  const parentObjectiveNormalized = normalizeWorkerPromptText(parentPrompt)
  const parentObjective = parentObjectiveNormalized.text
  return [
    'You are a Naruto route worker. Complete only this assigned work item and return JSON matching the required schema.',
    parentObjective ? `Parent Naruto objective:\n${parentObjective}` : null,
    `Work item: ${String(item?.id || '')} ${String(item?.title || item?.kind || '')}`,
    `Role: ${String(item?.required_role || 'worker')}`,
    `Kind: ${String(item?.kind || 'verification')}`,
    `Target paths: ${JSON.stringify(item?.target_paths || [])}`,
    `Readonly paths: ${JSON.stringify(item?.readonly_paths || [])}`,
    `Write paths: ${JSON.stringify(item?.write_paths || [])}`,
    writeAllowed
      ? 'If changes are needed, return model-authored patch_envelopes scoped to write paths.'
      : 'This is read-only work. Do not mutate files and return an empty patch_envelopes array.',
    writeAllowed
      ? 'Before changing exported signatures, inspect references and include cochanged callers in the same patch; only set cochange_acknowledged with a concrete compatibility reason.'
      : null,
    /bug|fix|regression|broken|버그|수정/i.test(String(item?.kind || '') + ' ' + String(item?.title || ''))
      ? 'Bugfix protocol: first add a regression test, record failed_before and passed_after in regression_proof, then patch the bug.'
      : null,
    /repair|conflict|fix/i.test(String(item?.kind || '') + ' ' + String(item?.title || ''))
      ? 'Repair protocol: write repair_hypothesis before patching, including failure, hypotheses, chosen evidence, and minimal_probe.'
      : null,
    writeAllowed
      ? null
      : 'For read-only work, inspect at most three targeted requested files/artifacts, then return final JSON. Do not recursively enumerate .sneakoscope, do not run broad find scans, and do not run package scripts, build commands, tests, git commands, or temp-file-creating checks unless the parent objective explicitly requires them.',
    'Impact scan, machine feedback, diff-quality, mistake-rule, TDD, and repair-hypothesis gates run before patch queue acceptance.',
    'Include verification checks, rollback notes, blockers, findings, changed_files, work_item_kind, regression_proof, repair_hypothesis, and tournament. Use null for optional proof fields that do not apply.'
  ].filter(Boolean).join('\n')
}

main().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error(err?.message || String(err))
  process.exit(1)
})

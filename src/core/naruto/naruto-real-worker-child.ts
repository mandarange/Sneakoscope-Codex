#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { runCodexTask, type CodexControlBackend } from '../codex-control/codex-control-plane.js'
import { CODEX_AGENT_WORKER_RESULT_SCHEMA_ID, codexAgentWorkerResultSchema } from '../codex-control/schemas/agent-worker-result.schema.js'

async function main() {
  const intakePath = process.argv[2]
  if (!intakePath) throw new Error('naruto worker intake path is required')
  const intake = await readJson<any>(intakePath, null)
  if (!intake?.result_path || !intake?.heartbeat_path || !intake?.item?.id) {
    throw new Error('naruto worker intake is invalid')
  }
  await fs.appendFile(intake.heartbeat_path, `${JSON.stringify({
    schema: 'sks.naruto-actual-worker-heartbeat.v1',
    ts: nowIso(),
	    item_id: intake.item.id,
	    status: 'running'
  })}\n`)
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
      prompt: buildNarutoWorkerPrompt(intake.item),
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
      blockers
    })
    await fs.appendFile(intake.heartbeat_path, `${JSON.stringify({
      schema: 'sks.naruto-actual-worker-heartbeat.v1',
      ts: nowIso(),
      item_id: intake.item.id,
      status: blockers.length ? 'blocked' : 'done'
    })}\n`)
  } catch (err: any) {
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
    await fs.appendFile(intake.heartbeat_path, `${JSON.stringify({
      schema: 'sks.naruto-actual-worker-heartbeat.v1',
      ts: nowIso(),
      item_id: intake.item.id,
      status: 'blocked'
    })}\n`)
    throw err
  }
}

function backendPreference(value: unknown): CodexControlBackend[] {
  const backend = String(value || '')
  if (backend === 'ollama' || backend === 'local-llm') return ['local-llm', 'codex-sdk']
  return ['codex-sdk']
}

function buildNarutoWorkerPrompt(item: any) {
  const writeAllowed = item?.write_allowed === true
  return [
    'You are a Naruto route worker. Complete only this assigned work item and return JSON matching the required schema.',
    `Work item: ${String(item?.id || '')} ${String(item?.title || item?.kind || '')}`,
    `Role: ${String(item?.required_role || 'worker')}`,
    `Kind: ${String(item?.kind || 'verification')}`,
    `Target paths: ${JSON.stringify(item?.target_paths || [])}`,
    `Readonly paths: ${JSON.stringify(item?.readonly_paths || [])}`,
    `Write paths: ${JSON.stringify(item?.write_paths || [])}`,
    writeAllowed
      ? 'If changes are needed, return model-authored patch_envelopes scoped to write paths.'
      : 'This is read-only work. Do not mutate files and return an empty patch_envelopes array.',
    'Include verification checks, rollback notes, blockers, findings, and changed_files.'
  ].join('\n')
}

main().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error(err?.message || String(err))
  process.exit(1)
})

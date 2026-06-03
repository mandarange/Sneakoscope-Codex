import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, writeJsonAtomic } from '../fsx.js'
import { validateJsonSchemaRecursive } from '../json-schema-validator.js'
import type { CodexTaskInput, CodexTaskResult } from './codex-control-plane.js'
import { resolveCodexOutputSchema } from './codex-output-schemas.js'
import { detectCodexSdkCapability } from './codex-sdk-capability.js'
import { mapCodexSdkSandboxPolicy } from './codex-sdk-sandbox-policy.js'
import { codexSdkRuntimePolicies, runRealCodexSdkTask } from './codex-sdk-adapter.js'
import { fakeCodexSdkAllowed, runFakeCodexSdkTask } from './codex-fake-sdk-adapter.js'
import { translateCodexSdkEvents } from './codex-event-translator.js'
import { writeCodexControlProof } from './codex-control-proof.js'
import { recordCodexThread } from './codex-thread-registry.js'
import { runWithCodexReliabilityShield } from './codex-reliability-shield.js'
import { routeCodexTask } from '../router/ultra-router.js'
import { writeUltraRouterProof } from '../router/router-proof.js'

export async function runCodexTask(input: CodexTaskInput): Promise<CodexTaskResult & Record<string, unknown>> {
  const root = path.resolve(input.mutationLedgerRoot)
  await ensureDir(root)
  const schema = resolveCodexOutputSchema(input.outputSchemaId, input.outputSchema)
  const routerDecision = routeCodexTask(input)
  const task = { ...input, tier: input.tier || routerDecision.tier, outputSchema: schema }
  await writeUltraRouterProof(root, { task, decision: routerDecision })
  const capability = await detectCodexSdkCapability()
  const sandbox = mapCodexSdkSandboxPolicy(task)
  const runtime = codexSdkRuntimePolicies(task)
  if (runtime.env.env.HOME) await ensureDir(runtime.env.env.HOME)
  if (runtime.env.env.CODEX_HOME) await ensureDir(runtime.env.env.CODEX_HOME)
  const fakeAllowed = fakeCodexSdkAllowed()
  const blockers = [
    ...(capability.ok || fakeAllowed ? [] : capability.blockers),
    ...(sandbox.ok ? [] : sandbox.blockers)
  ]
  let adapterResult: any = null
  if (!blockers.length) {
    adapterResult = await runWithCodexReliabilityShield(task, async () => {
      try {
        return fakeAllowed
          ? await runFakeCodexSdkTask(task)
          : await runRealCodexSdkTask(task, { sandboxMode: sandbox.sandboxMode, env: runtime.env.env, config: runtime.config })
      } catch (err: any) {
        return {
          ok: false,
          sdkThreadId: '',
          sdkRunId: null,
          events: [],
          finalResponse: '',
          structuredOutput: null,
          blockers: ['codex_sdk_run_failed:' + String(err?.message || err)]
        }
      }
    })
  }
  const events = Array.isArray(adapterResult?.events) ? adapterResult.events : []
  const translatedEvents = translateCodexSdkEvents(events)
  for (const event of translatedEvents) await appendJsonl(path.join(root, 'codex-sdk-events.jsonl'), event)
  if (adapterResult?.reliabilityShield) await writeJsonAtomic(path.join(root, 'codex-reliability-shield.json'), adapterResult.reliabilityShield)
  const structuredOutput = adapterResult?.structuredOutput
  const validation = structuredOutput ? validateJsonSchemaRecursive(structuredOutput, schema) : { ok: false, issues: ['structured_output_missing'] }
  const finalBlockers = [
    ...blockers,
    ...(adapterResult?.blockers || []),
    ...(events.length > 0 ? [] : ['codex_sdk_event_stream_missing']),
    ...(validation.ok ? [] : ['codex_sdk_structured_output_invalid', ...validation.issues.map((issue) => `schema:${issue}`)])
  ]
  const workerResult = normalizeWorkerResult(structuredOutput, task, finalBlockers, validation.ok)
  const workerResultPath = path.join(root, 'codex-sdk-worker-result.json')
  await writeJsonAtomic(workerResultPath, workerResult)
  const patchEnvelopePath = Array.isArray(workerResult.patch_envelopes) && workerResult.patch_envelopes.length
    ? path.join(root, 'codex-sdk-patch-envelope.json')
    : null
  if (patchEnvelopePath) {
    await writeJsonAtomic(patchEnvelopePath, {
      schema: 'sks.codex-sdk-patch-envelope.v1',
      generated_at: nowIso(),
      ok: true,
      envelope_count: workerResult.patch_envelopes.length,
      envelopes: workerResult.patch_envelopes
    })
  }
  const result: CodexTaskResult & Record<string, unknown> = {
    ok: finalBlockers.length === 0,
    backend: 'codex-sdk',
    sdkThreadId: String(adapterResult?.sdkThreadId || ''),
    sdkRunId: adapterResult?.sdkRunId ? String(adapterResult.sdkRunId) : null,
    streamEventCount: events.length,
    structuredOutputValid: validation.ok,
    workerResultPath,
    patchEnvelopePath,
    blockers: finalBlockers,
    reliabilityShield: adapterResult?.reliabilityShield || null,
    ultraRouterDecision: routerDecision as unknown as Record<string, unknown>,
    outputSchemaId: task.outputSchemaId,
    finalResponse: adapterResult?.finalResponse || '',
    eventTypes: events.map((event: any) => String(event?.type || 'unknown')),
    translatedEventCount: translatedEvents.length
  }
  await recordCodexThread(root, {
    route: task.route,
    mission_id: task.missionId,
    work_item_id: task.workItemId || null,
    slot_id: task.slotId || null,
    generation_index: task.generationIndex ?? null,
    session_id: task.sessionId || null,
    zellij_pane_id: task.zellijPaneId || null,
    sdk_thread_id: result.sdkThreadId,
    sdk_run_id: result.sdkRunId,
    stream_event_count: result.streamEventCount,
    output_schema_id: task.outputSchemaId,
    structured_output_valid: result.structuredOutputValid,
    worker_result_path: result.workerResultPath
  })
  await writeCodexControlProof(root, {
    task,
    result,
    capability: capability as unknown as Record<string, unknown>,
    sandbox,
    envProof: runtime.env.proof,
    config: runtime.config,
    reliabilityShield: adapterResult?.reliabilityShield || null,
    routerDecision: routerDecision as unknown as Record<string, unknown>,
    translatedEvents
  })
  return result
}

function normalizeWorkerResult(value: any, input: CodexTaskInput, blockers: string[], structuredOutputValid: boolean) {
  const status = blockers.length ? 'blocked' : normalizeStatus(value?.status)
  return {
    ...value,
    mission_id: String(value?.mission_id || input.missionId || ''),
    agent_id: String(value?.agent_id || input.slotId || input.workItemId || 'codex-sdk-worker'),
    session_id: String(value?.session_id || input.sessionId || input.workItemId || 'codex-sdk-session'),
    persona_id: String(value?.persona_id || value?.agent_id || input.slotId || 'codex-sdk-worker'),
    task_slice_id: String(value?.task_slice_id || input.workItemId || ''),
    backend: 'codex-sdk',
    status,
    summary: String(value?.summary || (blockers.length ? 'Codex SDK task blocked.' : 'Codex SDK task completed.')),
    findings: Array.isArray(value?.findings) ? value.findings : [],
    proposed_changes: Array.isArray(value?.proposed_changes) ? value.proposed_changes : [],
    changed_files: Array.isArray(value?.changed_files) ? value.changed_files : [],
    lease_compliance: value?.lease_compliance || { ok: true, violations: [] },
    artifacts: Array.isArray(value?.artifacts) ? value.artifacts : [],
    blockers,
    confidence: String(value?.confidence || (structuredOutputValid ? 'verified_partial' : 'blocked')),
    handoff_notes: String(value?.handoff_notes || 'Codex SDK Control Plane produced this worker result.'),
    unverified: Array.isArray(value?.unverified) ? value.unverified : [],
    writes: Array.isArray(value?.writes) ? value.writes : [],
    patch_envelopes: Array.isArray(value?.patch_envelopes) ? value.patch_envelopes : [],
    rollback_notes: Array.isArray(value?.rollback_notes) ? value.rollback_notes : [],
    verification: value?.verification || { status: structuredOutputValid ? 'passed' : 'failed', checks: ['codex-sdk-output-schema'] },
    recursion_guard: value?.recursion_guard || { ok: true, violations: [] }
  }
}

function normalizeStatus(value: unknown): 'done' | 'failed' | 'blocked' {
  return value === 'failed' || value === 'blocked' || value === 'done' ? value : 'done'
}

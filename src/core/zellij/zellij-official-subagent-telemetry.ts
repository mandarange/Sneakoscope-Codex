import { sha256 } from '../fsx.js'
import {
  normalizeSubagentParentSummary,
  type NormalizedSubagentEvent
} from '../subagents/subagent-evidence.js'
import {
  appendZellijSlotTelemetry,
  readZellijSlotTelemetrySnapshotNoRebuild,
  type ZellijSlotTelemetryEvent,
  type ZellijSlotTelemetrySnapshot
} from './zellij-slot-telemetry.js'

export const SKS_ZELLIJ_HOST_MISSION_ENV = 'SKS_ZELLIJ_HOST_MISSION_ID'

export async function recordOfficialSubagentZellijTelemetry(input: {
  root: string
  routeMissionId?: string | null
  event: NormalizedSubagentEvent
  payload?: any
  plan?: any
  env?: NodeJS.ProcessEnv
}) {
  const threadId = String(input.event?.thread_id || '').trim()
  if (!threadId) return { written: false, mission_ids: [], blocker: 'official_subagent_thread_id_missing' }
  const missionIds = officialSubagentTelemetryMissionIds(input.routeMissionId, input.env)
  if (!missionIds.length) return { written: false, mission_ids: [], blocker: 'official_subagent_telemetry_mission_missing' }

  const payload = objectValue(input.payload)
  const plan = objectValue(input.plan)
  const role = resolveRole(payload, plan)
  const rolePolicy = objectValue(objectValue(plan.agents)[role])
  const model = firstText(input.event.model, payload.model, rolePolicy.model) || 'unknown'
  const reasoning = firstText(payload.model_reasoning_effort, payload.reasoning_effort, payload.reasoningEffort, rolePolicy.model_reasoning_effort) || 'unknown'
  const provider = firstText(payload.provider, payload.model_provider, payload.modelProvider) || 'unknown'
  const serviceTier = firstText(payload.service_tier, payload.serviceTier) || 'unknown'
  const stopped = input.event.event_name === 'SubagentStop'
  const slotId = officialSubagentSlotId(threadId)
  const latest = await latestThreadSlot(input.root, missionIds, threadId)
  const generationIndex = stopped
    ? latest?.generation_index || 1
    : latest && isTerminal(latest.status) ? latest.generation_index + 1 : latest?.generation_index || 1
  const nickname = firstText(payload.nickname, payload.display_name, payload.displayName, payload.agent_name, payload.agentName)
  const summary = boundedText(firstText(payload.last_assistant_message, payload.lastAssistantMessage, payload.summary, payload.result), 1200)
  const explicitTaskTitle = boundedText(firstText(
    payload.task_title,
    payload.taskTitle,
    payload.task,
    nickname ? `${nickname} (${role})` : null
  ), 240)
  const taskTitle = stopped ? explicitTaskTitle : explicitTaskTitle || `${role} active`
  const lifecycleEvent: Omit<ZellijSlotTelemetryEvent, 'mission_id'> = {
    schema: 'sks.zellij-slot-telemetry-event.v1',
    ts: input.event.occurred_at,
    slot_id: slotId,
    generation_index: generationIndex,
    worker_id: threadId,
    event_type: stopped ? 'verification_started' : 'worker_spawned',
    status: stopped ? 'verifying' : 'running',
    role,
    backend: 'official-codex-subagent',
    provider,
    service_tier: serviceTier,
    model,
    reasoning_effort: reasoning,
    task_id: threadId,
    ...(taskTitle ? { task_title: taskTitle } : {}),
    current_file: null,
    ...(!stopped ? { spawned_at: input.event.occurred_at } : {}),
    artifact_paths: routeArtifactPaths(input.routeMissionId),
    log_tail: summary || `${stopped ? 'SubagentStop received; parent verdict pending' : 'Started'} · ${role} · ${model}/${reasoning}`,
    blockers: stopped && input.event.outcome !== 'stopped' ? [`awaiting_parent_verdict:${input.event.outcome}`] : []
  }
  const appendResult = await appendToMissions(input.root, missionIds, lifecycleEvent)
  return {
    written: appendResult.written_mission_ids.length > 0,
    mission_ids: missionIds,
    written_mission_ids: appendResult.written_mission_ids,
    failed_mission_ids: appendResult.failed_mission_ids,
    ...(appendResult.failed_mission_ids.length > 0
      ? { blocker: appendResult.written_mission_ids.length > 0 ? 'official_subagent_telemetry_partial_write' : 'official_subagent_telemetry_write_failed' }
      : {}),
    slot_id: slotId,
    generation_index: generationIndex,
    status: lifecycleEvent.status,
    role,
    model
  }
}

export async function recordOfficialSubagentParentOutcomesTelemetry(input: {
  root: string
  routeMissionId?: string | null
  parentSummary?: unknown
  plan?: any
  env?: NodeJS.ProcessEnv
}) {
  const normalized = normalizeSubagentParentSummary(input.parentSummary)
  const parent = normalized.raw
  if (!normalized.trustworthy || !parent) {
    return { written: false, mission_ids: [], blocker: 'trustworthy_parent_summary_missing' }
  }
  const plan = objectValue(input.plan)
  const activeRunId = firstText(plan.workflow_run_id, plan.run_id)
  if (activeRunId && parent.run_id !== activeRunId) {
    return { written: false, mission_ids: [], blocker: 'parent_summary_run_id_mismatch' }
  }
  const missionIds = officialSubagentTelemetryMissionIds(input.routeMissionId, input.env)
  const rows = Array.isArray(parent.thread_outcomes) ? parent.thread_outcomes : []
  if (!missionIds.length || !rows.length) {
    return { written: false, mission_ids: missionIds, blocker: rows.length ? 'official_subagent_telemetry_mission_missing' : 'parent_thread_outcomes_missing' }
  }

  const written: string[] = []
  const skipped: string[] = []
  const alreadyApplied: string[] = []
  const successfulThreadIds: string[] = []
  const failedWrites: Array<{ mission_id: string; thread_id: string; error: string }> = []
  for (const outcome of rows) {
    const threadId = String(outcome?.thread_id || '').trim()
    if (!threadId) continue
    for (const missionId of missionIds) {
      const latest = await latestThreadSlotForMission(input.root, missionId, threadId)
      const stopFailureBlocker = failedOrAmbiguousStopBlocker(latest?.blockers)
      // SubagentStop has no trustworthy success status of its own, but a
      // normalized failed/ambiguous outcome is still negative evidence. A
      // structurally valid parent summary must not erase that evidence by
      // declaring the same thread completed. Surface the contradiction as a
      // failed slot so the CLI/Zellij observer remains fail closed.
      const completed = outcome.status === 'completed' && !stopFailureBlocker
      const desiredStatus = completed ? 'completed' : 'failed'
      if (latest?.status === desiredStatus) {
        alreadyApplied.push(`${missionId}:${threadId}`)
        successfulThreadIds.push(threadId)
        continue
      }
      if (!latest || latest.status !== 'verifying') {
        skipped.push(`${missionId}:${threadId}`)
        continue
      }
      const role = latest.role || singleSuggestedAgent(plan) || 'official_subagent'
      const parentOutcomeConflict = outcome.status === 'completed' && Boolean(stopFailureBlocker)
      const event: ZellijSlotTelemetryEvent = {
        schema: 'sks.zellij-slot-telemetry-event.v1',
        ts: new Date().toISOString(),
        mission_id: missionId,
        slot_id: officialSubagentSlotId(threadId),
        generation_index: latest.generation_index || 1,
        worker_id: threadId,
        event_type: completed ? 'verification_passed' : 'verification_failed',
        status: desiredStatus,
        role,
        backend: latest.backend || 'official-codex-subagent',
        provider: latest.provider || 'unknown',
        service_tier: latest.service_tier || 'unknown',
        model: latest.model || modelForRole(plan, role) || 'unknown',
        reasoning_effort: latest.reasoning_effort || reasoningForRole(plan, role) || 'unknown',
        task_id: threadId,
        task_title: boundedText(latest.task_title || `${role} parent verdict`, 240) || `${role} parent verdict`,
        current_file: latest.current_file || null,
        artifact_paths: routeArtifactPaths(input.routeMissionId),
        log_tail: parentOutcomeConflict
          ? `${role}: completed parent verdict rejected because ${stopFailureBlocker}`
          : boundedText(outcome.summary, 1200) || `${role}: ${outcome.status}`,
        blockers: completed
          ? []
          : parentOutcomeConflict
            ? [String(stopFailureBlocker), 'parent_thread_outcome_conflict:completed']
            : [`parent_thread_outcome:${outcome.status}`]
      }
      try {
        await appendZellijSlotTelemetry(input.root, event)
        written.push(`${missionId}:${threadId}`)
        successfulThreadIds.push(threadId)
      } catch (err: any) {
        failedWrites.push({ mission_id: missionId, thread_id: threadId, error: boundedText(err?.message || String(err), 320) || 'telemetry_write_failed' })
      }
    }
  }
  return {
    written: written.length > 0 || alreadyApplied.length > 0,
    mission_ids: missionIds,
    thread_ids: unique(successfulThreadIds),
    written_mission_threads: written,
    already_applied_mission_threads: alreadyApplied,
    skipped_thread_ids: skipped,
    failed_writes: failedWrites,
    failed_mission_ids: unique(failedWrites.map((row) => row.mission_id)),
    ...(failedWrites.length > 0
      ? { blocker: written.length > 0 || alreadyApplied.length > 0 ? 'official_subagent_parent_telemetry_partial_write' : 'official_subagent_parent_telemetry_write_failed' }
      : written.length === 0 && alreadyApplied.length === 0 && skipped.length > 0
        ? { blocker: 'subagent_stop_telemetry_missing' }
        : {})
  }
}

export function officialSubagentTelemetryMissionIds(
  routeMissionId?: string | null,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return unique([
    safeMissionId(routeMissionId),
    safeMissionId(env[SKS_ZELLIJ_HOST_MISSION_ENV])
  ])
}

export function officialSubagentSlotId(threadId: string): string {
  return `sub-${sha256(String(threadId || '')).slice(0, 8)}`
}

async function appendToMissions(
  root: string,
  missionIds: string[],
  event: Omit<ZellijSlotTelemetryEvent, 'mission_id'>
) {
  const results = await Promise.allSettled(missionIds.map((missionId) => appendZellijSlotTelemetry(root, { ...event, mission_id: missionId })))
  return {
    written_mission_ids: missionIds.filter((_missionId, index) => results[index]?.status === 'fulfilled'),
    failed_mission_ids: missionIds.filter((_missionId, index) => results[index]?.status === 'rejected')
  }
}

async function latestThreadSlot(
  root: string,
  missionIds: string[],
  threadId: string
): Promise<ZellijSlotTelemetrySnapshot['slots'][string] | null> {
  let latest: ZellijSlotTelemetrySnapshot['slots'][string] | null = null
  for (const missionId of missionIds) {
    const snapshot = await readZellijSlotTelemetrySnapshotNoRebuild(root, missionId).catch(() => null)
    for (const row of Object.values(snapshot?.slots || {})) {
      if (row.worker_id !== threadId) continue
      if (!latest || row.generation_index > latest.generation_index || Date.parse(row.latest_ts) > Date.parse(latest.latest_ts)) latest = row
    }
  }
  return latest
}

async function latestThreadSlotForMission(
  root: string,
  missionId: string,
  threadId: string
): Promise<ZellijSlotTelemetrySnapshot['slots'][string] | null> {
  const snapshot = await readZellijSlotTelemetrySnapshotNoRebuild(root, missionId).catch(() => null)
  let latest: ZellijSlotTelemetrySnapshot['slots'][string] | null = null
  for (const row of Object.values(snapshot?.slots || {})) {
    if (row.worker_id !== threadId) continue
    if (!latest || row.generation_index > latest.generation_index || Date.parse(row.latest_ts) > Date.parse(latest.latest_ts)) latest = row
  }
  return latest
}

function resolveRole(payload: Record<string, any>, plan: Record<string, any>): string {
  return firstText(
    payload.agent_type,
    payload.agentType,
    payload.custom_agent,
    payload.customAgent,
    payload.role,
    payload.name,
    singleSuggestedAgent(plan)
  ) || 'official_subagent'
}

function singleSuggestedAgent(plan: Record<string, any>): string | null {
  const suggested = Array.isArray(plan.suggested_agents) ? plan.suggested_agents.map(String).filter(Boolean) : []
  return suggested.length === 1 ? suggested[0] || null : null
}

function modelForRole(plan: unknown, role: string): string | null {
  return firstText(objectValue(objectValue(plan).agents)[role]?.model)
}

function reasoningForRole(plan: unknown, role: string): string | null {
  return firstText(objectValue(objectValue(plan).agents)[role]?.model_reasoning_effort)
}

function routeArtifactPaths(missionId?: string | null): string[] {
  const mission = safeMissionId(missionId)
  if (!mission) return []
  const base = `.sneakoscope/missions/${mission}`
  return [`${base}/subagent-plan.json`, `${base}/subagent-events.jsonl`, `${base}/subagent-evidence.json`]
}

function isTerminal(status: unknown): boolean {
  return ['completed', 'failed', 'drained'].includes(String(status || '').toLowerCase())
}

function failedOrAmbiguousStopBlocker(blockers: unknown): string | null {
  if (!Array.isArray(blockers)) return null
  return blockers
    .map((value) => String(value || '').trim())
    .find((value) => /^awaiting_parent_verdict:(failed|ambiguous)$/.test(value)) || null
}

function safeMissionId(value: unknown): string {
  const text = String(value || '').trim()
  if (!text || !/^[A-Za-z0-9._:-]+$/.test(text)) return ''
  return text
}

function boundedText(value: unknown, max: number): string | null {
  const text = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return null
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(String).filter(Boolean))]
}

import fsp from 'node:fs/promises'
import path from 'node:path'
import { appendJsonlBounded, nowIso, writeJsonAtomic } from '../fsx.js'

export const SUBAGENT_EVIDENCE_SCHEMA = 'sks.subagent-evidence.v1'
export const SUBAGENT_EVENT_SCHEMA = 'sks.subagent-event.v1'
export const SUBAGENT_PARENT_SUMMARY_SCHEMA = 'sks.subagent-parent-summary.v1'
export const SUBAGENT_EVIDENCE_FILENAME = 'subagent-evidence.json'
export const SUBAGENT_EVENT_LOG_FILENAME = 'subagent-events.jsonl'

export type SubagentEventName = 'SubagentStart' | 'SubagentStop'

export interface NormalizedSubagentEvent {
  schema: typeof SUBAGENT_EVENT_SCHEMA
  event_name: SubagentEventName
  thread_id: string | null
  thread_id_source: 'thread_id' | 'agent_id' | 'session_id' | null
  agent_id: string | null
  session_id: string | null
  model: string | null
  outcome: 'started' | 'stopped' | 'failed'
  occurred_at: string
}

export interface SubagentEvidence {
  schema: typeof SUBAGENT_EVIDENCE_SCHEMA
  workflow: 'official_codex_subagent'
  requested_subagents: number
  started_threads: number
  completed_threads: number
  failed_threads: number
  started_thread_ids: string[]
  completed_thread_ids: string[]
  failed_thread_ids: string[]
  open_thread_ids: string[]
  unmatched_stop_thread_ids: string[]
  event_sources: SubagentEventName[]
  parent_summary_present: boolean
  parent_summary_trustworthy: boolean
  parent_summary_status: 'completed' | 'failed' | 'ambiguous' | null
  ambiguous_stop_thread_ids: string[]
  preparation_only: boolean
  status: 'completed' | 'incomplete' | 'blocked' | 'preparation_only'
  ok: boolean
  blockers: string[]
}

export interface StructuredSubagentParentSummary {
  schema: typeof SUBAGENT_PARENT_SUMMARY_SCHEMA
  status: 'completed' | 'blocked' | 'failed'
  summary: string
  thread_outcomes: Array<{
    thread_id: string
    status: 'completed' | 'blocked' | 'failed'
    summary: string
  }>
  changed_files?: string[]
  verification?: unknown[]
  blockers?: string[]
}

export interface BuildSubagentEvidenceInput {
  requestedSubagents: number
  events?: readonly unknown[]
  parentSummary?: unknown
  parentSummaryPresent?: boolean
  workflowStatus?: string | null
  preparationOnly?: boolean
}

export function normalizeSubagentEvent(payload: unknown, explicitEventName?: unknown): NormalizedSubagentEvent | null {
  const row = isRecord(payload) ? payload : {}
  const nested = isRecord(row.payload)
    ? row.payload
    : isRecord(row.data)
      ? row.data
      : isRecord(row.input)
        ? row.input
        : {}
  const merged = { ...nested, ...row }
  const eventName = normalizeEventName(
    explicitEventName
      ?? row.hook_event_name
      ?? row.hookEventName
      ?? row.event_name
      ?? row.eventName
      ?? row.event
      ?? row.type
      ?? nested.hook_event_name
      ?? nested.hookEventName
      ?? nested.event_name
      ?? nested.eventName
      ?? nested.event
      ?? nested.type
  )
  if (!eventName) return null

  const explicitThreadId = firstText(
    row.thread_id,
    row.threadId,
    row.agent_thread_id,
    row.agentThreadId,
    row.subagent_thread_id,
    row.subagentThreadId,
    nested.thread_id,
    nested.threadId,
    nested.agent_thread_id,
    nested.agentThreadId,
    nested.subagent_thread_id,
    nested.subagentThreadId,
    recordId(row.thread),
    recordId(nested.thread)
  )
  const agentId = firstText(row.agent_id, row.agentId, nested.agent_id, nested.agentId, recordId(row.agent), recordId(nested.agent))
  const sessionId = firstText(row.session_id, row.sessionId, nested.session_id, nested.sessionId, recordId(row.session), recordId(nested.session))
  const threadId = explicitThreadId || agentId || sessionId || null
  const threadIdSource = explicitThreadId
    ? 'thread_id'
    : agentId
      ? 'agent_id'
      : sessionId
        ? 'session_id'
        : null

  return {
    schema: SUBAGENT_EVENT_SCHEMA,
    event_name: eventName,
    thread_id: threadId,
    thread_id_source: threadIdSource,
    agent_id: agentId || null,
    session_id: sessionId || null,
    model: firstText(row.model, nested.model) || null,
    outcome: eventName === 'SubagentStart'
      ? 'started'
      : stopFailed(merged)
        ? 'failed'
        : 'stopped',
    occurred_at: firstText(
      row.occurred_at,
      row.timestamp,
      row.created_at,
      row.ts,
      nested.occurred_at,
      nested.timestamp,
      nested.created_at,
      nested.ts
    ) || nowIso()
  }
}

export function buildSubagentEvidence(input: BuildSubagentEvidenceInput): SubagentEvidence {
  const requestedSubagents = normalizeRequested(input.requestedSubagents)
  const events = (input.events || [])
    .map((event) => normalizeSubagentEvent(event))
    .filter((event): event is NormalizedSubagentEvent => Boolean(event))
  const starts = new Set<string>()
  const successfulStops = new Set<string>()
  const failedStops = new Set<string>()
  const unmatchedStops = new Set<string>()
  const ambiguousStops = new Set<string>()
  const eventSources = new Set<SubagentEventName>()
  let missingThreadId = false

  const parentSummary = normalizeSubagentParentSummary(input.parentSummary)

  for (const event of events) {
    eventSources.add(event.event_name)
    if (!event.thread_id) {
      missingThreadId = true
      continue
    }
    if (event.event_name === 'SubagentStart') {
      starts.add(event.thread_id)
      continue
    }
    if (!starts.has(event.thread_id)) {
      unmatchedStops.add(event.thread_id)
      continue
    }
    if (event.outcome === 'failed') {
      failedStops.add(event.thread_id)
      successfulStops.delete(event.thread_id)
      continue
    }
    const parentOutcome = parentSummary.thread_outcomes.get(event.thread_id)
    if (parentOutcome === 'failed') {
      failedStops.add(event.thread_id)
      successfulStops.delete(event.thread_id)
    } else if (parentOutcome === 'completed' && !failedStops.has(event.thread_id)) {
      successfulStops.add(event.thread_id)
    } else {
      ambiguousStops.add(event.thread_id)
    }
  }

  const completedThreadIds = [...successfulStops]
    .filter((threadId) => starts.has(threadId))
    .sort()
  const failedThreadIds = [...failedStops]
    .filter((threadId) => starts.has(threadId))
    .sort()
  const startedThreadIds = [...starts].sort()
  const stoppedThreadIds = new Set([...completedThreadIds, ...failedThreadIds])
  const openThreadIds = startedThreadIds.filter((threadId) => !stoppedThreadIds.has(threadId))
  const preparationOnly = input.preparationOnly === true || isPreparationStatus(input.workflowStatus)
  const parentSummaryPresent = input.parentSummaryPresent
    ?? parentSummary.present
  const blockers: string[] = []

  if (preparationOnly) blockers.push('subagent_workflow_preparation_only')
  if (requestedSubagents < 1) blockers.push('requested_subagents_missing')
  if (missingThreadId) blockers.push('subagent_event_thread_id_missing')
  if (startedThreadIds.length < requestedSubagents) {
    blockers.push(`requested_subagent_starts_incomplete:${startedThreadIds.length}/${requestedSubagents}`)
  }
  if (completedThreadIds.length < requestedSubagents) {
    blockers.push(`requested_subagent_completions_incomplete:${completedThreadIds.length}/${requestedSubagents}`)
  }
  if (failedThreadIds.length > 0) blockers.push(`subagent_threads_failed:${failedThreadIds.length}`)
  if (openThreadIds.length > 0) blockers.push(`subagent_threads_still_open:${openThreadIds.length}`)
  if (unmatchedStops.size > 0) blockers.push(`subagent_stops_without_start:${unmatchedStops.size}`)
  if (ambiguousStops.size > 0) blockers.push(`subagent_thread_outcomes_ambiguous:${ambiguousStops.size}`)
  if (!parentSummaryPresent) blockers.push('parent_summary_missing')
  else if (!parentSummary.trustworthy) blockers.push(...parentSummary.blockers)
  if (parentSummary.status === 'failed') blockers.push('parent_summary_failed')

  const ok = blockers.length === 0
  const status: SubagentEvidence['status'] = preparationOnly
    ? 'preparation_only'
    : ok
      ? 'completed'
      : failedThreadIds.length > 0
        ? 'blocked'
        : 'incomplete'

  return {
    schema: SUBAGENT_EVIDENCE_SCHEMA,
    workflow: 'official_codex_subagent',
    requested_subagents: requestedSubagents,
    started_threads: startedThreadIds.length,
    completed_threads: completedThreadIds.length,
    failed_threads: failedThreadIds.length,
    started_thread_ids: startedThreadIds,
    completed_thread_ids: completedThreadIds,
    failed_thread_ids: failedThreadIds,
    open_thread_ids: openThreadIds,
    unmatched_stop_thread_ids: [...unmatchedStops].sort(),
    event_sources: [...eventSources].sort(eventSourceOrder),
    parent_summary_present: parentSummaryPresent,
    parent_summary_trustworthy: parentSummary.trustworthy,
    parent_summary_status: parentSummary.status,
    ambiguous_stop_thread_ids: [...ambiguousStops].sort(),
    preparation_only: preparationOnly,
    status,
    ok,
    blockers
  }
}

export async function recordSubagentEvent(
  artifactDir: string,
  payload: unknown,
  explicitEventName?: unknown
): Promise<NormalizedSubagentEvent | null> {
  const event = normalizeSubagentEvent(payload, explicitEventName)
  if (!event) return null
  await appendJsonlBounded(path.join(artifactDir, SUBAGENT_EVENT_LOG_FILENAME), event, 1024 * 1024)
  return event
}

export async function readSubagentEvents(artifactDir: string): Promise<NormalizedSubagentEvent[]> {
  const text = await fsp.readFile(path.join(artifactDir, SUBAGENT_EVENT_LOG_FILENAME), 'utf8').catch(() => '')
  const events: NormalizedSubagentEvent[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const event = normalizeSubagentEvent(parsed)
    if (event) events.push(event)
  }
  return events
}

export async function writeSubagentEvidence(
  artifactDir: string,
  input: BuildSubagentEvidenceInput
): Promise<SubagentEvidence> {
  const events = input.events ?? await readSubagentEvents(artifactDir)
  const evidence = buildSubagentEvidence({ ...input, events })
  await writeJsonAtomic(path.join(artifactDir, SUBAGENT_EVIDENCE_FILENAME), evidence)
  return evidence
}

export const normalizeSubagentEvidence = buildSubagentEvidence

function normalizeEventName(value: unknown): SubagentEventName | null {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z]+/g, '')
  if (normalized === 'subagentstart') return 'SubagentStart'
  if (normalized === 'subagentstop') return 'SubagentStop'
  return null
}

function stopFailed(row: Record<string, unknown>): boolean {
  const status = firstText(row.status, row.outcome, row.result, row.state).toLowerCase()
  const resultText = firstText(
    row.last_assistant_message,
    row.lastAssistantMessage,
    row.summary,
    row.message,
    row.result_text,
    row.resultText
  )
  return row.ok === false
    || row.success === false
    || row.failed === true
    || Boolean(row.error)
    || /^(failed|failure|error|blocked|cancelled|canceled|interrupted|timed[_ -]?out)$/.test(status)
    || /\b(failed|failure|error|blocked|cancelled|canceled|timed\s*out|could\s+not|unable\s+to|not\s+completed|incomplete)\b|실패|차단|오류|에러|완료하지\s*못|미완료/i.test(resultText)
}

export function normalizeSubagentParentSummary(value: unknown): {
  present: boolean
  trustworthy: boolean
  status: 'completed' | 'failed' | 'ambiguous' | null
  summary: string | null
  thread_outcomes: Map<string, 'completed' | 'failed' | 'ambiguous'>
  blockers: string[]
  raw: StructuredSubagentParentSummary | null
} {
  const present = hasMeaningfulSummary(value)
  const parsed = parseStructuredParentSummary(value)
  const threadOutcomes = new Map<string, 'completed' | 'failed' | 'ambiguous'>()
  const blockers: string[] = []
  if (!parsed) {
    if (present) blockers.push('parent_summary_untrusted')
    return {
      present,
      trustworthy: false,
      status: present ? 'ambiguous' : null,
      summary: null,
      thread_outcomes: threadOutcomes,
      blockers,
      raw: null
    }
  }

  const summary = String(parsed.summary || '').trim()
  if (!summary) blockers.push('parent_summary_text_missing')
  if (!Array.isArray(parsed.thread_outcomes) || parsed.thread_outcomes.length === 0) {
    blockers.push('parent_thread_outcomes_missing')
  }
  for (const row of Array.isArray(parsed.thread_outcomes) ? parsed.thread_outcomes : []) {
    const threadId = firstText(row?.thread_id)
    const status = normalizeTerminalOutcome(row?.status)
    if (!threadId) {
      blockers.push('parent_thread_outcome_thread_id_missing')
      continue
    }
    if (threadOutcomes.has(threadId)) {
      blockers.push(`parent_thread_outcome_duplicate:${threadId}`)
      continue
    }
    threadOutcomes.set(threadId, status)
    if (status === 'ambiguous') blockers.push(`parent_thread_outcome_ambiguous:${threadId}`)
  }

  const status = normalizeTerminalOutcome(parsed.status)
  if (status === 'ambiguous') blockers.push('parent_summary_status_ambiguous')
  return {
    present: true,
    trustworthy: blockers.length === 0,
    status,
    summary: summary || null,
    thread_outcomes: threadOutcomes,
    blockers: uniqueStrings(blockers.length ? blockers : []),
    raw: parsed
  }
}

function parseStructuredParentSummary(value: unknown): StructuredSubagentParentSummary | null {
  if (isRecord(value)) return validStructuredParentSummary(value)
  if (typeof value !== 'string' || !value.trim()) return null
  const candidates = [value.trim(), ...jsonFenceBodies(value)]
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const valid = validStructuredParentSummary(parsed)
      if (valid) return valid
    } catch {}
  }
  return null
}

function validStructuredParentSummary(value: unknown): StructuredSubagentParentSummary | null {
  if (!isRecord(value) || value.schema !== SUBAGENT_PARENT_SUMMARY_SCHEMA) return null
  if (!Array.isArray(value.thread_outcomes)) return null
  return value as unknown as StructuredSubagentParentSummary
}

function jsonFenceBodies(value: string): string[] {
  const out: string[] = []
  for (const match of value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) out.push(match[1].trim())
  }
  return out.reverse()
}

function normalizeTerminalOutcome(value: unknown): 'completed' | 'failed' | 'ambiguous' {
  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (/^(completed|complete|success|succeeded|passed|ok)$/.test(status)) return 'completed'
  if (/^(blocked|failed|failure|error|cancelled|canceled|interrupted|timed_out|incomplete)$/.test(status)) return 'failed'
  return 'ambiguous'
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function normalizeRequested(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}

function isPreparationStatus(value: unknown): boolean {
  return /^(delegation_context_ready|context_ready|prepared|preparation_only)$/.test(String(value || '').trim().toLowerCase())
}

function hasMeaningfulSummary(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return isRecord(value) && Object.keys(value).length > 0
}

function eventSourceOrder(a: SubagentEventName, b: SubagentEventName): number {
  return (a === 'SubagentStart' ? 0 : 1) - (b === 'SubagentStart' ? 0 : 1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function recordId(value: unknown): unknown {
  return isRecord(value) ? value.id : undefined
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

import fsp from 'node:fs/promises'
import path from 'node:path'
import { appendJsonlBounded, nowIso, writeJsonAtomic } from '../fsx.js'

export const SUBAGENT_EVIDENCE_SCHEMA = 'sks.subagent-evidence.v1'
export const SUBAGENT_EVENT_SCHEMA = 'sks.subagent-event.v1'
export const SUBAGENT_PARENT_SUMMARY_SCHEMA = 'sks.subagent-parent-summary.v1'
export const SUBAGENT_EVIDENCE_FILENAME = 'subagent-evidence.json'
export const SUBAGENT_EVENT_LOG_FILENAME = 'subagent-events.jsonl'
export const SUBAGENT_PARENT_SUMMARY_FILENAME = 'subagent-parent-summary.json'

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
  additionalBlockers?: readonly unknown[]
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
  for (const blocker of input.additionalBlockers || []) {
    const normalized = String(blocker || '').trim()
    if (normalized) blockers.push(normalized)
  }

  const uniqueBlockers = uniqueStrings(blockers)
  const ok = uniqueBlockers.length === 0
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
    blockers: uniqueBlockers
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

export async function persistOrReuseTrustworthySubagentParentSummary(
  artifactDir: string,
  value: unknown,
  opts: { workflowStatus?: string | null } = {}
): Promise<unknown> {
  const incoming = normalizeSubagentParentSummary(value)
  const file = path.join(artifactDir, SUBAGENT_PARENT_SUMMARY_FILENAME)
  const workflowFailed = isFailureWorkflowStatus(opts.workflowStatus)
  if (incoming.trustworthy && incoming.status === 'failed' && incoming.raw) {
    await writeJsonAtomic(file, incoming.raw)
    return incoming.raw
  }
  if (workflowFailed || incoming.status === 'failed' || parentResultExplicitlyFailed(value)) {
    await fsp.rm(file, { force: true }).catch(() => undefined)
    if (workflowFailed && incoming.trustworthy && incoming.status === 'completed') return null
    return value
  }
  if (incoming.trustworthy && incoming.raw) {
    await writeJsonAtomic(file, incoming.raw)
    return incoming.raw
  }
  const persisted = await fsp.readFile(file, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null)
  const previous = normalizeSubagentParentSummary(persisted)
  return previous.trustworthy && previous.raw ? previous.raw : value
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
    || containsUnambiguousFailureText(resultText)
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
  if (typeof parsed.summary !== 'string' || !summary) blockers.push('parent_summary_text_missing')
  const topLevelKeys = new Set(['schema', 'status', 'summary', 'thread_outcomes', 'changed_files', 'verification', 'blockers'])
  for (const key of Object.keys(parsed as any)) {
    if (!topLevelKeys.has(key)) blockers.push(`parent_summary_unknown_field:${key}`)
  }
  if (parsed.changed_files !== undefined && (!Array.isArray(parsed.changed_files) || parsed.changed_files.some((item) => typeof item !== 'string'))) {
    blockers.push('parent_summary_changed_files_invalid')
  }
  if (parsed.verification !== undefined && !Array.isArray(parsed.verification)) blockers.push('parent_summary_verification_invalid')
  if (parsed.blockers !== undefined && (!Array.isArray(parsed.blockers) || parsed.blockers.some((item) => typeof item !== 'string'))) {
    blockers.push('parent_summary_blockers_invalid')
  }
  if (!Array.isArray(parsed.thread_outcomes) || parsed.thread_outcomes.length === 0) {
    blockers.push('parent_thread_outcomes_missing')
  }
  for (const row of Array.isArray(parsed.thread_outcomes) ? parsed.thread_outcomes : []) {
    if (!isRecord(row)) {
      blockers.push('parent_thread_outcome_invalid')
      continue
    }
    const rowKeys = new Set(['thread_id', 'status', 'summary'])
    for (const key of Object.keys(row)) {
      if (!rowKeys.has(key)) blockers.push(`parent_thread_outcome_unknown_field:${key}`)
    }
    const threadId = firstText(row?.thread_id)
    const status = strictTerminalOutcome(row?.status)
    const rowSummary = typeof row?.summary === 'string' ? row.summary.trim() : ''
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
    if (!rowSummary) blockers.push(`parent_thread_outcome_summary_missing:${threadId}`)
    if (status === 'completed' && containsUnambiguousFailureText(rowSummary)) {
      blockers.push(`parent_thread_outcome_text_contradiction:${threadId}`)
    }
  }

  const status = strictTerminalOutcome(parsed.status)
  if (status === 'ambiguous') blockers.push('parent_summary_status_ambiguous')
  if (status === 'completed' && containsUnambiguousFailureText(summary)) blockers.push('parent_summary_text_contradiction')
  if (status === 'completed' && Array.isArray(parsed.blockers) && parsed.blockers.length > 0) {
    blockers.push('parent_summary_completed_with_blockers')
  }
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
  const trimmed = value.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1]?.trim()
  const candidates = [trimmed, ...(fenced ? [fenced] : [])]
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

function strictTerminalOutcome(value: unknown): 'completed' | 'failed' | 'ambiguous' {
  const status = String(value || '').trim().toLowerCase()
  if (status === 'completed') return 'completed'
  if (status === 'blocked' || status === 'failed') return 'failed'
  return 'ambiguous'
}

function containsUnambiguousFailureText(value: unknown): boolean {
  const source = String(value || '').trim()
  if (!source) return false
  const scrubbed = source
    .replace(/\b(?:no|without)\s+(?:errors?|failures?|blockers?|issues?)\b/gi, ' ')
    .replace(/\bnot\s+blocked\b/gi, ' ')
    .replace(/\b(?:did\s+not|didn't)\s+fail\b/gi, ' ')
    .replace(/\b(?:failure|error|blocked)[- ]path\b/gi, ' ')
    .replace(/\b(?:could\s+not|unable\s+to)\s+(?:reproduce|find|detect|observe|identify)\b[^.!?\n]*/gi, ' ')
    .replace(/(?:실패한|차단된|오류(?:가|는)?\s*발생한?)\s*(?:테스트|검사|항목|문제)(?:가|이|는|은)?\s*(?:없음|없다|없습니다)/g, ' ')
    .replace(/(?:실패|오류|에러|차단|문제)(?:가|이|는|은)?\s*(?:없음|없다|없습니다|없이)/g, ' ')
    .replace(/차단되지\s*않(?:음|았다|았습니다)/g, ' ')
  return /^(?:failed|failure|error|blocked|cancelled|canceled|interrupted|timed\s*out|incomplete)\b/i.test(scrubbed)
    || /\b(?:slice|thread|task|work|review|integration|execution|run|job|agent|subagent)\b[^.!?\n]{0,32}\b(?:failed|blocked|cancelled|canceled|interrupted|timed\s*out|not\s+completed|incomplete)\b/i.test(scrubbed)
    || /\b(?:could\s+not|unable\s+to|failed\s+to)\s+(?:complete|finish|deliver|execute|run|continue|return)\b/i.test(scrubbed)
    || /(?:작업|슬라이스|스레드|검수|통합|실행|에이전트|서브\s*에이전트)[^.!?\n]{0,20}(?:실패|차단|중단|미완료)/i.test(scrubbed)
    || /(?:완료|수행|실행|진행|통합)하지\s*못|완료되지\s*않|미완료/i.test(scrubbed)
}

function parentResultExplicitlyFailed(value: unknown): boolean {
  if (typeof value === 'string') return containsUnambiguousFailureText(value)
  if (!isRecord(value)) return false
  const status = firstText(value.status, value.outcome, value.result, value.state).toLowerCase()
  const resultText = firstText(
    value.summary,
    value.message,
    value.last_assistant_message,
    value.lastAssistantMessage,
    value.result_text,
    value.resultText
  )
  return value.ok === false
    || value.success === false
    || value.failed === true
    || Boolean(value.error)
    || (Array.isArray(value.blockers) && value.blockers.length > 0)
    || /^(failed|failure|error|blocked|cancelled|canceled|interrupted|timed[_ -]?out|incomplete)$/.test(status)
    || containsUnambiguousFailureText(resultText)
}

function isFailureWorkflowStatus(value: unknown): boolean {
  return /^(parent_failed|failed|blocked|incomplete|cancelled|canceled|timed[_ -]?out)$/i.test(String(value || '').trim())
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

import { nowIso } from '../fsx.js'
import type { CodexTaskInput } from './codex-control-plane.js'

export const CODEX_RELIABILITY_SHIELD_SCHEMA = 'sks.codex-reliability-shield.v1'

export interface CodexReliabilityAttemptResult {
  ok?: boolean
  sdkThreadId?: string
  sdkRunId?: string | null
  events?: any[]
  finalResponse?: string
  structuredOutput?: unknown
  blockers?: string[]
  [key: string]: unknown
}

export interface CodexReliabilityPolicy {
  maxEmptyResultRetries: number
  idleTimeoutMs: number
  timeoutClass: 'short' | 'standard' | 'long'
}

export interface CodexReliabilityReport {
  schema: typeof CODEX_RELIABILITY_SHIELD_SCHEMA
  generated_at: string
  ok: boolean
  route: string
  mission_id: string
  timeout_class: CodexReliabilityPolicy['timeoutClass']
  idle_timeout_ms: number
  max_empty_result_retries: number
  attempts: CodexReliabilityAttemptReport[]
  selected_attempt: number
  retry_count: number
  heartbeat_count: number
  repaired_tool_result_count: number
  no_duplicate_streamed_output: boolean
  model_capacity_retry_count: number
  selected_model_capacity_fallback: boolean
  blockers: string[]
}

export interface CodexReliabilityAttemptReport {
  attempt: number
  event_count: number
  meaningful_event_count: number
  partial_meaningful_output: boolean
  empty_result: boolean
  retryable: boolean
  retry_reason: string | null
  idle_timeout: boolean
  fatal_error: boolean
  mcp_auth_error: boolean
  model_capacity_error: boolean
  capacity_fallback_hint: string | null
  repaired_tool_result_count: number
  heartbeat_count: number
  blockers: string[]
}

export function normalizeCodexReliabilityPolicy(input: CodexTaskInput): CodexReliabilityPolicy {
  const policy = input.reliabilityPolicy || {}
  const timeoutClass = policy.timeoutClass || (input.tier === 'orchestrator' ? 'long' : 'standard')
  const fallbackIdle = timeoutClass === 'short' ? 20_000 : timeoutClass === 'long' ? 180_000 : 60_000
  return {
    maxEmptyResultRetries: clampInt(policy.maxEmptyResultRetries, 1, 0, 3),
    idleTimeoutMs: clampInt(policy.idleTimeoutMs, fallbackIdle, 1_000, 15 * 60_000),
    timeoutClass
  }
}

export async function runWithCodexReliabilityShield(
  input: CodexTaskInput,
  runAttempt: (attempt: number, controls?: { noMcp?: boolean }) => Promise<CodexReliabilityAttemptResult>
): Promise<CodexReliabilityAttemptResult & { reliabilityShield: CodexReliabilityReport }> {
  const policy = normalizeCodexReliabilityPolicy(input)
  const attempts: CodexReliabilityAttemptReport[] = []
  let selected: CodexReliabilityAttemptResult | null = null
  let selectedAttempt = 0
  const controls: { noMcp?: boolean } = {}

  for (let attempt = 1; attempt <= policy.maxEmptyResultRetries + 1; attempt += 1) {
    const raw = await runAttempt(attempt, controls)
    const repaired = repairToolCallSequence(Array.isArray(raw.events) ? raw.events : [])
    const heartbeats = buildKeepaliveHeartbeats(repaired.events)
    const evaluation = evaluateCodexReliabilityAttempt(raw, repaired.events, policy, attempt)
    const report = {
      ...evaluation,
      repaired_tool_result_count: repaired.repairedToolResultCount,
      heartbeat_count: heartbeats.length
    }
    attempts.push(report)
    selected = {
      ...raw,
      events: repaired.events,
      reliabilityHeartbeats: heartbeats,
      blockers: report.mcp_auth_error ? report.blockers : [...(raw.blockers || []), ...report.blockers]
    }
    selectedAttempt = attempt
    if (report.retryable && report.mcp_auth_error) controls.noMcp = true
    if (!report.retryable || attempt > policy.maxEmptyResultRetries) break
  }

  const blockers = attempts.flatMap((attempt) => attempt.blockers)
  const modelCapacityRetryCount = attempts.filter((attempt) => attempt.model_capacity_error && attempt.retryable).length
  const report: CodexReliabilityReport = {
    schema: CODEX_RELIABILITY_SHIELD_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    route: input.route,
    mission_id: input.missionId,
    timeout_class: policy.timeoutClass,
    idle_timeout_ms: policy.idleTimeoutMs,
    max_empty_result_retries: policy.maxEmptyResultRetries,
    attempts,
    selected_attempt: selectedAttempt,
    retry_count: Math.max(0, selectedAttempt - 1),
    heartbeat_count: attempts.reduce((sum, attempt) => sum + attempt.heartbeat_count, 0),
    repaired_tool_result_count: attempts.reduce((sum, attempt) => sum + attempt.repaired_tool_result_count, 0),
    no_duplicate_streamed_output: attempts.slice(0, -1).every((attempt) => attempt.meaningful_event_count === 0),
    model_capacity_retry_count: modelCapacityRetryCount,
    selected_model_capacity_fallback: selectedAttempt > 1 && modelCapacityRetryCount > 0,
    blockers
  }
  return {
    ...(selected || { ok: false, events: [], blockers: ['codex_sdk_attempt_missing'] }),
    reliabilityShield: report
  }
}

export function evaluateCodexReliabilityAttempt(
  result: CodexReliabilityAttemptResult,
  events: any[],
  policy: CodexReliabilityPolicy,
  attempt: number
): CodexReliabilityAttemptReport {
  const meaningful = events.filter(isMeaningfulEvent)
  const modelCapacity = isCodexModelCapacityError(result, events)
  const mcpAuth = isMcpAuthError(result, events)
  const fatal = !modelCapacity && !mcpAuth && hasFatalError(result, events)
  const idle = hasIdleTimeout(events, policy.idleTimeoutMs)
  const empty = events.length === 0 || (!String(result.finalResponse || '').trim() && meaningful.length === 0)
  const partial = meaningful.length > 0 && !result.structuredOutput
  const blockers: string[] = []
  let retryable = false
  let retryReason: string | null = null

  if (modelCapacity) blockers.push('codex_model_capacity_unavailable')
  if (mcpAuth) blockers.push('codex_reliability_mcp_auth_error')
  if (!modelCapacity && idle && partial) blockers.push('codex_reliability_idle_after_partial_output')
  if (!modelCapacity && partial && !idle) blockers.push('codex_reliability_partial_output_without_structured_result')
  if (fatal) blockers.push('codex_reliability_fatal_error_no_retry')

  if (mcpAuth) {
    retryable = true
    retryReason = 'mcp_auth_error_retry_no_mcp'
  } else if (!modelCapacity && !fatal && idle && meaningful.length === 0) {
    retryable = true
    retryReason = 'stream_idle_before_meaningful_event'
  } else if (!modelCapacity && !fatal && empty) {
    retryable = true
    retryReason = 'empty_sdk_result_before_meaningful_event'
  }

  return {
    attempt,
    event_count: events.length,
    meaningful_event_count: meaningful.length,
    partial_meaningful_output: partial,
    empty_result: empty,
    retryable,
    retry_reason: retryReason,
    idle_timeout: idle,
    fatal_error: fatal,
    mcp_auth_error: mcpAuth,
    model_capacity_error: modelCapacity,
    capacity_fallback_hint: null,
    repaired_tool_result_count: 0,
    heartbeat_count: 0,
    blockers
  }
}

export function isCodexModelCapacityError(result: CodexReliabilityAttemptResult, events: any[]) {
  const text = collectText(result, events)
  return /selected model is at capacity|model(?:\s+[\w.-]+)?\s+is\s+at\s+capacity|try a different model|capacity(?:\s+is)?\s+exhausted|temporarily at capacity/i.test(text)
}

export function repairToolCallSequence(events: any[]) {
  const repaired = [...events]
  const openToolCalls = new Set<string>()
  for (const event of events) {
    const id = toolCallId(event)
    if (!id) continue
    if (isToolCallStart(event)) openToolCalls.add(id)
    if (isToolCallResult(event)) openToolCalls.delete(id)
  }
  for (const id of openToolCalls) {
    repaired.push({
      type: 'tool_result.stubbed',
      item: {
        id: `${id}:stub`,
        type: 'tool_result',
        tool_call_id: id,
        text: 'SKS Reliability Shield inserted an explicit missing tool-result stub.'
      }
    })
  }
  return { events: repaired, repairedToolResultCount: openToolCalls.size }
}

export function buildKeepaliveHeartbeats(events: any[]) {
  return events
    .filter((event) => /reasoning|thinking/i.test(String(event?.type || event?.item?.type || '')))
    .map((event, index) => ({
      schema: 'sks.codex-reliability-heartbeat.v1',
      ts: nowIso(),
      index,
      sdk_event_type: String(event?.type || event?.item?.type || 'unknown'),
      lane_status: 'thinking',
      content_redacted: true
    }))
}

function isMeaningfulEvent(event: any) {
  const type = String(event?.type || '')
  const itemType = String(event?.item?.type || '')
  return type === 'turn.completed'
    || type === 'item.completed'
    || itemType === 'agent_message'
    || itemType === 'file_change'
    || itemType === 'command_execution'
    || itemType === 'mcp_tool_call'
}

function hasFatalError(result: CodexReliabilityAttemptResult, events: any[]) {
  if (isMcpAuthError(result, events)) return false
  const text = collectFatalSignalText(result, events)
  return /\b(?:4\d\d|fatal|unauthorized|forbidden|authrequired|invalid oauth|side-effect applied|partial patch applied)\b/i.test(text)
}

function isMcpAuthError(result: CodexReliabilityAttemptResult, events: any[]) {
  const text = collectText(result, events)
  return /\b(?:authrequired|oauth)\b/i.test(text)
    && /transport channel closed|rmcp/i.test(text)
    && !/side-effect applied|partial patch applied/i.test(text)
}

function collectText(result: CodexReliabilityAttemptResult, events: any[]) {
  return [
    String(result.finalResponse || ''),
    ...(Array.isArray(result.blockers) ? result.blockers : []),
    ...events.map((event) => [
      event?.error?.message,
      event?.message,
      event?.item?.text,
      event?.raw?.failed_event?.error?.message
    ].filter(Boolean).join('\n'))
  ].join('\n')
}

function collectFatalSignalText(result: CodexReliabilityAttemptResult, events: any[]) {
  return [
    ...(Array.isArray(result.blockers) ? result.blockers : []),
    ...events
      .filter((event) => event?.type === 'turn.failed' || event?.type === 'error')
      .map((event) => [
        event?.error?.message,
        event?.message,
        event?.raw?.failed_event?.error?.message
      ].filter(Boolean).join('\n'))
  ].join('\n')
}

function hasIdleTimeout(events: any[], idleTimeoutMs: number) {
  const stamps = events.map(eventTimeMs).filter((value) => Number.isFinite(value))
  if (stamps.length < 2) return false
  for (let i = 1; i < stamps.length; i += 1) {
    const current = stamps[i]
    const previous = stamps[i - 1]
    if (current !== undefined && previous !== undefined && current - previous > idleTimeoutMs) return true
  }
  return false
}

function eventTimeMs(event: any) {
  const raw = event?.ts || event?.timestamp || event?.created_at
  if (!raw) return NaN
  const parsed = Date.parse(String(raw))
  return Number.isFinite(parsed) ? parsed : NaN
}

function isToolCallStart(event: any) {
  const type = String(event?.type || '')
  const itemType = String(event?.item?.type || '')
  return /tool_call|mcp_tool_call|command_execution/.test(type) || itemType === 'mcp_tool_call' || itemType === 'command_execution'
}

function isToolCallResult(event: any) {
  const type = String(event?.type || '')
  const itemType = String(event?.item?.type || '')
  return /tool_result|command_output|tool\.completed/.test(type) || itemType === 'tool_result' || itemType === 'command_output'
}

function toolCallId(event: any) {
  const item = event?.item || {}
  const id = item.tool_call_id || item.call_id || item.id || event?.tool_call_id || event?.call_id
  return id ? String(id) : null
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

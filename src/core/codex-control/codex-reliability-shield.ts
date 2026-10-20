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

/**
 * Model capacity is a shortage that clears by itself, and a retry right after it fails again: the
 * 2026-10-20 release smoke failed 12 of 12 back-to-back attempts. Each capacity retry waits longer.
 */
const DEFAULT_CAPACITY_BACKOFF_MS = [15_000, 45_000, 90_000]
const MODEL_CAPACITY_RE = /selected model is at capacity|model(?:\s+[\w.-]+)?\s+is\s+at\s+capacity|try a different model|capacity(?:\s+is)?\s+exhausted|temporarily at capacity/i
/** Account quota; waiting minutes does not lift it, so it is never retried. */
const USAGE_LIMIT_RE = /hit your usage limit|usage limit (?:has been )?reached/i
/** Completed items that are not output or a side effect: config warnings and thinking. */
const NON_WORK_ITEM_TYPES = new Set(['error', 'reasoning'])

export interface CodexReliabilityPolicy {
  maxEmptyResultRetries: number
  /** Capacity retries; the nth waits `capacityBackoffMs[n - 1]`. */
  maxCapacityRetries: number
  capacityBackoffMs: number[]
  /** A capacity failure after the attempt did work is retried only when a rerun cannot repeat a side effect. */
  retryCapacityAfterWork: boolean
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
  max_capacity_retries: number
  attempts: CodexReliabilityAttemptReport[]
  selected_attempt: number
  retry_count: number
  heartbeat_count: number
  repaired_tool_result_count: number
  missing_tool_result_count: number
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
  /** How long the shield waited before the next attempt because of a capacity failure; null when it did not. */
  capacity_wait_ms: number | null
  capacity_fallback_hint: string | null
  repaired_tool_result_count: number
  missing_tool_result_count: number
  heartbeat_count: number
  blockers: string[]
}

export function codexTimeoutClassForRoute(
  route: unknown,
  fallback: CodexReliabilityPolicy['timeoutClass'] = 'standard'
): CodexReliabilityPolicy['timeoutClass'] {
  return /^\$?naruto$/i.test(String(route || '').trim()) ? 'long' : fallback
}

export function normalizeCodexReliabilityPolicy(input: CodexTaskInput): CodexReliabilityPolicy {
  const policy = input.reliabilityPolicy || {}
  const timeoutClass = codexTimeoutClassForRoute(
    input.route,
    policy.timeoutClass || (input.tier === 'orchestrator' ? 'long' : 'standard')
  )
  const fallbackIdle = timeoutClass === 'short' ? 20_000 : timeoutClass === 'long' ? 180_000 : 60_000
  const backoff = (Array.isArray(policy.capacityBackoffMs) && policy.capacityBackoffMs.length
    ? policy.capacityBackoffMs
    : DEFAULT_CAPACITY_BACKOFF_MS
  ).slice(0, 5).map((wait, index) => clampInt(wait, DEFAULT_CAPACITY_BACKOFF_MS[index] ?? 90_000, 0, 10 * 60_000))
  return {
    maxEmptyResultRetries: clampInt(policy.maxEmptyResultRetries, 1, 0, 3),
    maxCapacityRetries: clampInt(policy.maxCapacityRetries, backoff.length, 0, backoff.length),
    capacityBackoffMs: backoff,
    retryCapacityAfterWork: input.sandboxPolicy === 'read-only',
    idleTimeoutMs: clampInt(policy.idleTimeoutMs, fallbackIdle, 1_000, 15 * 60_000),
    timeoutClass
  }
}

export async function runWithCodexReliabilityShield(
  input: CodexTaskInput,
  runAttempt: (attempt: number, controls?: { noMcp?: boolean }) => Promise<CodexReliabilityAttemptResult>
): Promise<CodexReliabilityAttemptResult & { reliabilityShield: CodexReliabilityReport }> {
  const policy = normalizeCodexReliabilityPolicy(input)
  const deadlineEpochMs = Number(input.reliabilityPolicy?.deadlineEpochMs)
  const attempts: CodexReliabilityAttemptReport[] = []
  let selected: CodexReliabilityAttemptResult | null = null
  let selectedAttempt = 0
  let emptyRetries = 0
  let capacityRetries = 0
  const controls: { noMcp?: boolean } = {}

  for (let attempt = 1; ; attempt += 1) {
    const raw = await runAttempt(attempt, controls)
    const continuity = auditToolOutputContinuity(Array.isArray(raw.events) ? raw.events : [])
    const heartbeats = buildKeepaliveHeartbeats(continuity.events)
    const evaluation = evaluateCodexReliabilityAttempt(raw, continuity.events, policy, attempt)
    const missingToolOutput = continuity.missingToolResultCount > 0
    const report = {
      ...evaluation,
      retryable: missingToolOutput ? false : evaluation.retryable,
      retry_reason: missingToolOutput ? null : evaluation.retry_reason,
      fatal_error: missingToolOutput || evaluation.fatal_error,
      blockers: missingToolOutput
        ? [...evaluation.blockers, 'codex_reliability_missing_tool_output_unrecoverable']
        : evaluation.blockers,
      repaired_tool_result_count: 0,
      missing_tool_result_count: continuity.missingToolResultCount,
      heartbeat_count: heartbeats.length
    }
    // Capacity retries have their own budget and backoff. An attempt that is not retried - budget spent,
    // deadline too close, or unrecoverable for another reason - ends the run as a capacity failure.
    let capacityWaitMs: number | null = null
    if (report.model_capacity_error) {
      capacityWaitMs = report.retryable ? nextCapacityWaitMs(policy, capacityRetries, deadlineEpochMs) : null
      if (capacityWaitMs === null) {
        report.retryable = false
        report.retry_reason = null
        report.blockers = [...report.blockers, 'codex_model_capacity_unavailable']
      } else {
        report.capacity_wait_ms = capacityWaitMs
      }
    }
    attempts.push(report)
    selected = {
      ...raw,
      events: continuity.events,
      reliabilityHeartbeats: heartbeats,
      blockers: report.mcp_auth_error ? report.blockers : [...(raw.blockers || []), ...report.blockers]
    }
    selectedAttempt = attempt
    if (report.retryable && report.mcp_auth_error) controls.noMcp = true
    if (!report.retryable) break
    if (capacityWaitMs !== null) {
      capacityRetries += 1
      await new Promise<void>((resolve) => setTimeout(resolve, capacityWaitMs))
    } else if (emptyRetries < policy.maxEmptyResultRetries) {
      emptyRetries += 1
    } else {
      break
    }
  }

  const blockers = attempts.flatMap((attempt) => attempt.blockers)
  const report: CodexReliabilityReport = {
    schema: CODEX_RELIABILITY_SHIELD_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    route: input.route,
    mission_id: input.missionId,
    timeout_class: policy.timeoutClass,
    idle_timeout_ms: policy.idleTimeoutMs,
    max_empty_result_retries: policy.maxEmptyResultRetries,
    max_capacity_retries: policy.maxCapacityRetries,
    attempts,
    selected_attempt: selectedAttempt,
    retry_count: Math.max(0, selectedAttempt - 1),
    heartbeat_count: attempts.reduce((sum, attempt) => sum + attempt.heartbeat_count, 0),
    repaired_tool_result_count: attempts.reduce((sum, attempt) => sum + attempt.repaired_tool_result_count, 0),
    missing_tool_result_count: attempts.reduce((sum, attempt) => sum + attempt.missing_tool_result_count, 0),
    no_duplicate_streamed_output: attempts.slice(0, -1).every((attempt) => attempt.meaningful_event_count === 0),
    model_capacity_retry_count: capacityRetries,
    // True when the run recovered: capacity retries happened and the attempt that was kept did not hit capacity.
    selected_model_capacity_fallback: capacityRetries > 0 && attempts[attempts.length - 1]?.model_capacity_error === false,
    blockers
  }
  const selectedResult = selected || { ok: false, events: [], blockers: ['codex_sdk_attempt_missing'] }
  return {
    ...selectedResult,
    ok: report.ok && selectedResult.ok === true,
    blockers: [...new Set([...(selectedResult.blockers || []), ...(!report.ok ? report.blockers : [])])],
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
  const missingToolOutputProtocolError = isMissingToolOutputProtocolError(result, events)
  const fatal = !modelCapacity && !mcpAuth && (missingToolOutputProtocolError || hasFatalError(result, events))
  const idle = hasIdleTimeout(events, policy.idleTimeoutMs)
  const empty = events.length === 0 || (!String(result.finalResponse || '').trim() && meaningful.length === 0)
  const partial = meaningful.length > 0 && !result.structuredOutput
  const blockers: string[] = []
  let retryable = false
  let retryReason: string | null = null

  // No capacity blocker here: whether a retry is still affordable is the loop's call, and it records
  // `codex_model_capacity_unavailable` when none is. Otherwise a recovered run would carry it forever.
  if (mcpAuth) blockers.push('codex_reliability_mcp_auth_error')
  if (!modelCapacity && idle && partial) blockers.push('codex_reliability_idle_after_partial_output')
  if (!modelCapacity && partial && !idle) blockers.push('codex_reliability_partial_output_without_structured_result')
  if (missingToolOutputProtocolError) blockers.push('codex_reliability_missing_tool_output_unrecoverable')
  else if (fatal) blockers.push('codex_reliability_fatal_error_no_retry')

  if (mcpAuth) {
    retryable = true
    retryReason = 'mcp_auth_error_retry_no_mcp'
  } else if (modelCapacity) {
    // Capacity clears on its own, so a retry is safe unless this attempt already produced output or a
    // side effect that a rerun could repeat; a read-only task has none to repeat.
    if (meaningful.length === 0 || policy.retryCapacityAfterWork) {
      retryable = true
      retryReason = 'model_capacity_backoff_retry'
    }
  } else if (!fatal && idle && meaningful.length === 0) {
    retryable = true
    retryReason = 'stream_idle_before_meaningful_event'
  } else if (!fatal && empty) {
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
    capacity_wait_ms: null,
    capacity_fallback_hint: null,
    repaired_tool_result_count: 0,
    missing_tool_result_count: 0,
    heartbeat_count: 0,
    blockers
  }
}

/**
 * Whether the attempt's own failure signals - its blockers and its `error` / `turn.failed` events - report
 * model capacity. Agent text never counts: a worker that merely writes "try a different model" is not
 * a capacity failure, and a retry of it would rerun a finished task.
 */
export function isCodexModelCapacityError(result: CodexReliabilityAttemptResult, events: any[]) {
  return MODEL_CAPACITY_RE.test(collectFailureSignalText(result, events))
}

function nextCapacityWaitMs(policy: CodexReliabilityPolicy, retriesDone: number, deadlineEpochMs: number): number | null {
  const base = policy.capacityBackoffMs[retriesDone]
  if (retriesDone >= policy.maxCapacityRetries || base === undefined) return null
  // Jitter, so parallel workers that hit the same capacity wall do not retry in lockstep.
  const wait = Math.round(base * (0.75 + Math.random() * 0.5))
  const hasDeadline = Number.isFinite(deadlineEpochMs) && deadlineEpochMs > 0
  return hasDeadline && deadlineEpochMs - Date.now() <= wait ? null : wait
}

export function isMissingToolOutputProtocolError(result: CodexReliabilityAttemptResult, events: any[]) {
  return /\[No tool output found for (?:custom\s+)?tool call\s+[^\]]+\]/i.test(collectText(result, events))
}

export function auditToolOutputContinuity(events: any[]) {
  const preserved = [...events]
  const openToolCalls = new Set<string>()
  for (const event of events) {
    const id = toolCallId(event)
    if (!id) continue
    if (isToolCallStart(event)) openToolCalls.add(id)
    if (isToolCallResult(event)) openToolCalls.delete(id)
  }
  return {
    events: preserved,
    missingToolResultCount: openToolCalls.size,
    missingToolCallIds: [...openToolCalls]
  }
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
  // Codex reports config warnings as completed `error` items and thinking as `reasoning` items. A failure
  // after only those is still a failure before any work, which is what keeps it retryable.
  if (type === 'item.completed' && !NON_WORK_ITEM_TYPES.has(itemType)) return true
  return type === 'turn.completed'
    || itemType === 'agent_message'
    || itemType === 'file_change'
    || itemType === 'command_execution'
    || itemType === 'mcp_tool_call'
}

function hasFatalError(result: CodexReliabilityAttemptResult, events: any[]) {
  if (isMcpAuthError(result, events)) return false
  const text = collectFailureSignalText(result, events)
  return /\b(?:4\d\d|fatal|unauthorized|forbidden|authrequired|invalid oauth|side-effect applied|partial patch applied)\b/i.test(text)
    || USAGE_LIMIT_RE.test(text)
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

/** What the attempt itself reported as failing: its blockers and the messages of its `error` / `turn.failed` events. */
function collectFailureSignalText(result: CodexReliabilityAttemptResult, events: any[]) {
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
  const type = String(event?.type || '').toLowerCase()
  const itemType = String(toolEventItem(event)?.type || '').toLowerCase()
  return isTrackedToolCallType(type) || isTrackedToolCallType(itemType)
}

function isToolCallResult(event: any) {
  const type = String(event?.type || '').toLowerCase()
  const itemType = String(toolEventItem(event)?.type || '').toLowerCase()
  return isTrackedToolOutputType(type)
    || isTrackedToolOutputType(itemType)
    || /tool_result|tool\.completed/.test(type)
    || itemType === 'tool_result'
}

function isTrackedToolCallType(type: string) {
  return type === 'function_call'
    || type === 'custom_tool_call'
    || type === 'apply_patch_call'
    || /(?:^|\.)function_call(?:\.added|\.started|\.completed)?$/.test(type)
    || /(?:^|\.)custom_tool_call(?:\.added|\.started|\.completed)?$/.test(type)
    || /(?:^|\.)apply_patch_call(?:\.added|\.started|\.completed)?$/.test(type)
}

function isTrackedToolOutputType(type: string) {
  return type === 'function_call_output'
    || type === 'custom_tool_call_output'
    || type === 'apply_patch_call_output'
    || type.endsWith('.function_call_output')
    || type.endsWith('.custom_tool_call_output')
    || type.endsWith('.apply_patch_call_output')
}

function toolCallId(event: any) {
  const item = toolEventItem(event) || {}
  const id = item.tool_call_id || item.call_id || item.id || event?.tool_call_id || event?.call_id
  return id ? String(id) : null
}

function toolEventItem(event: any): Record<string, any> | null {
  const candidates = [
    event?.item,
    event?.type === 'response_item' ? event?.payload : null,
    event?.response_item?.payload,
    event?.response_item,
    event?.raw?.response_item?.payload,
    event?.raw?.type === 'response_item' ? event?.raw?.payload : null
  ]
  return candidates.find((candidate) => candidate && typeof candidate === 'object') || null
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

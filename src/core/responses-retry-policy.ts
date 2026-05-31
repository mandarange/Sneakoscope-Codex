export const RESPONSES_RETRY_POLICY_SCHEMA = 'sks.responses-retry-policy.v1'

export interface ResponsesRetryPolicy {
  schema: typeof RESPONSES_RETRY_POLICY_SCHEMA
  max_attempts: number
  base_delay_ms: number
  max_delay_ms: number
  retryable_statuses: number[]
  retryable_error_codes: string[]
  adapters: string[]
}

export const DEFAULT_RESPONSES_RETRY_POLICY: ResponsesRetryPolicy = Object.freeze({
  schema: RESPONSES_RETRY_POLICY_SCHEMA,
  max_attempts: 4,
  base_delay_ms: 500,
  max_delay_ms: 8000,
  retryable_statuses: [408, 409, 425, 429, 500, 502, 503, 504],
  retryable_error_codes: ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'rate_limit_exceeded', 'server_error'],
  adapters: ['source-intelligence', 'codex-web', 'mcp', 'imagegen']
})

export function responsesRetryDelayMs(attempt: number, policy: ResponsesRetryPolicy = DEFAULT_RESPONSES_RETRY_POLICY): number {
  const exp = Math.max(0, attempt - 1)
  return Math.min(policy.max_delay_ms, policy.base_delay_ms * 2 ** exp)
}

export function shouldRetryResponsesError(input: { status?: number | null; code?: string | null; attempt: number }, policy: ResponsesRetryPolicy = DEFAULT_RESPONSES_RETRY_POLICY): boolean {
  if (input.attempt >= policy.max_attempts) return false
  if (input.status && policy.retryable_statuses.includes(input.status)) return true
  if (input.code && policy.retryable_error_codes.includes(input.code)) return true
  return false
}

export interface ResponsesRetryAttempt {
  attempt: number
  status: number | null
  code: string | null
  delay_ms: number | null
  retried: boolean
}

export interface ResponsesRetryOutcome<T> {
  result: T
  attempts: number
  retry_log: ResponsesRetryAttempt[]
}

/**
 * Run an async operation under the centralized responses retry policy with
 * exponential backoff. The operation returns a classification `{ status, code }`
 * (HTTP status and/or error code) alongside its `value`; the wrapper retries
 * only on policy-retryable statuses/codes (429, 5xx, timeouts, transient
 * network errors), records a structured retry log, and otherwise returns the
 * last value. A thrown error is classified via `classifyError` (default: read
 * `err.code`) and retried the same way; the final attempt re-throws.
 */
export async function withResponsesRetry<T>(
  operation: (attempt: number) => Promise<{ value: T; status?: number | null; code?: string | null }>,
  opts: {
    policy?: ResponsesRetryPolicy
    sleep?: (ms: number) => Promise<void>
    classifyError?: (err: unknown) => { status?: number | null; code?: string | null }
  } = {}
): Promise<ResponsesRetryOutcome<T>> {
  const policy = opts.policy || DEFAULT_RESPONSES_RETRY_POLICY
  const sleep = opts.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const classifyError = opts.classifyError || ((err: unknown) => ({ code: (err as { code?: string } | null)?.code || 'request_failed', status: null }))
  const retryLog: ResponsesRetryAttempt[] = []
  let lastError: unknown = null
  for (let attempt = 1; attempt <= policy.max_attempts; attempt += 1) {
    try {
      const { value, status = null, code = null } = await operation(attempt)
      const retry = shouldRetryResponsesError({ status, code, attempt }, policy)
      if (!retry) {
        retryLog.push({ attempt, status, code, delay_ms: null, retried: false })
        return { result: value, attempts: attempt, retry_log: retryLog }
      }
      const delay = responsesRetryDelayMs(attempt, policy)
      retryLog.push({ attempt, status, code, delay_ms: delay, retried: true })
      await sleep(delay)
    } catch (err) {
      lastError = err
      const { status = null, code = null } = classifyError(err)
      const retry = shouldRetryResponsesError({ status, code, attempt }, policy)
      if (!retry) {
        retryLog.push({ attempt, status, code, delay_ms: null, retried: false })
        throw err
      }
      const delay = responsesRetryDelayMs(attempt, policy)
      retryLog.push({ attempt, status, code, delay_ms: delay, retried: true })
      await sleep(delay)
    }
  }
  if (lastError) throw lastError
  // Exhausted retries on a retryable status without throwing: surface the last attempt.
  throw new Error('responses_retry_exhausted')
}

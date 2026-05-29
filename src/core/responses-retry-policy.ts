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
  adapters: ['source-intelligence', 'codex-web', 'mcp']
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

// Ledger T5: a structurally ambiguous thread is recoverable. A lost tool output
// affects only the turn that reports it; once recovered, the thread continues.

export function missingToolOutputCallId(text: unknown): string | null {
  return String(text || '').match(/\[No tool output found for (?:custom\s+)?tool call\s+([^\].\s]+)\.?\]/i)?.[1] || null
}

export function missingToolOutputCallIdFromPayload(payload: any = {}): string | null {
  const candidates = [
    payload.prompt,
    payload.user_prompt,
    payload.userPrompt,
    payload.last_assistant_message,
    payload.assistant_message,
    payload.previous_assistant_message,
    payload.prior_assistant_message,
    payload.response,
    payload.raw,
    payload.error,
    payload.error_message,
    payload.errorMessage,
    payload.last_error,
    payload.raw_error,
    payload.rawError,
    payload.result
  ]
  const seen = new Set<object>()
  let visited = 0
  const scan = (value: unknown, depth = 0): string | null => {
    if (visited >= 128 || depth > 4 || value === null || value === undefined) return null
    visited += 1
    if (typeof value === 'string' || typeof value === 'number') return missingToolOutputCallId(value)
    if (typeof value !== 'object' || seen.has(value)) return null
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = scan(item, depth + 1)
        if (found) return found
      }
      return null
    }
    for (const nested of Object.values(value)) {
      const found = scan(nested, depth + 1)
      if (found) return found
    }
    return null
  }
  for (const candidate of candidates) {
    const found = scan(candidate)
    if (found) return found
  }
  return null
}

export function interruptedToolOutputRecoveryBlockReason(input: {
  callId?: unknown
  missionId?: unknown
} = {}) {
  const callId = String(input.callId || 'unknown')
  const missionId = String(input.missionId || '').trim() || 'none'
  return [
    `Custom tool call ${callId} returned no output (active mission: ${missionId}), so its result is unknown.`,
    'Do not replay a possibly mutating action; inspect its side effects first.',
    'If the provider dropped the call, check it with `sks bridge status --json` and `sks bridge verify --level deep --strict`; if codex-lb stays unavailable, disable only that provider with `sks bridge provider disable codex-lb` (ChatGPT OAuth and provider credentials are kept).',
    'After that, continuing in this thread is fine; open a fresh thread only if the conversation keeps failing.'
  ].join(' ')
}

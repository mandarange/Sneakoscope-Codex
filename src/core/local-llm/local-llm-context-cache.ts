import { sha256 } from '../fsx.js'

const SECRET_PATTERNS = [/api[_-]?key/i, /token/i, /secret/i, /password/i, /authorization/i]

export function buildLocalLlmContextCacheKey(parts: Record<string, unknown>) {
  const redacted = redactSecrets(parts)
  return {
    schema: 'sks.local-llm-context-cache-key.v1',
    key: sha256(JSON.stringify(redacted)),
    redacted
  }
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    SECRET_PATTERNS.some((pattern) => pattern.test(key)) ? '[redacted]' : redactSecrets(child)
  ]))
}

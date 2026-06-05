export interface LocalLlmJsonRepairResult {
  ok: boolean
  value: unknown
  repaired: boolean
  attempts: number
  error?: string
}

export function parseOrRepairLocalLlmJson(text: string): LocalLlmJsonRepairResult {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const direct = tryParse(raw)
  if (direct.ok) return { ok: true, value: direct.value, repaired: false, attempts: 0 }
  const extracted = extractFirstJsonObject(raw)
  if (extracted) {
    const parsed = tryParse(extracted)
    if (parsed.ok) return { ok: true, value: parsed.value, repaired: true, attempts: 1 }
  }
  return { ok: false, value: null, repaired: false, attempts: 1, error: direct.error || 'json_parse_failed' }
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf('{')
  if (start < 0) return ''
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return ''
}

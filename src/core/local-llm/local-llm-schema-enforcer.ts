import { validateJsonSchemaRecursive } from '../json-schema-validator.js'
import { parseOrRepairLocalLlmJson } from './local-llm-json-repair.js'

export function enforceLocalLlmJsonSchema(text: string, schema: Record<string, unknown>) {
  const parsed = parseOrRepairLocalLlmJson(text)
  const validation = parsed.ok ? validateJsonSchemaRecursive(parsed.value, schema) : { ok: false, issues: [parsed.error || 'json_parse_failed'] }
  return {
    ok: parsed.ok && validation.ok,
    value: parsed.ok ? parsed.value : null,
    repaired: parsed.repaired,
    repair_attempts: parsed.attempts,
    schema_valid: validation.ok,
    issues: validation.issues
  }
}

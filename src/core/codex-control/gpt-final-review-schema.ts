export const GPT_FINAL_ARBITER_RESULT_SCHEMA_ID = 'sks.gpt-final-arbiter-result.v1'
export const GPT_FINAL_ARBITER_INPUT_SCHEMA = 'sks.gpt-final-arbiter-input.v1'

const reviewItemSchema = {
  type: 'object',
  required: ['id', 'severity', 'summary'],
  properties: {
    id: { type: 'string' },
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: { type: 'string' }
  },
  additionalProperties: false
} as const

const patchDecisionSchema = {
  type: 'object',
  required: ['id', 'summary', 'patch_envelope_json'],
  properties: {
    id: { type: 'string' },
    summary: { type: 'string' },
    patch_envelope_json: { type: 'string' }
  },
  additionalProperties: false
} as const

export const gptFinalArbiterResultSchema = {
  type: 'object',
  required: [
    'schema',
    'status',
    'summary',
    'gpt_review_findings',
    'accepted_patch_envelopes',
    'modified_patch_envelopes',
    'rejected_patch_envelopes',
    'required_followup_work',
    'verification_plan',
    'rollback_notes',
    'blockers',
    'confidence'
  ],
  properties: {
    schema: { type: 'string', enum: [GPT_FINAL_ARBITER_RESULT_SCHEMA_ID] },
    status: { enum: ['approved', 'modified', 'rejected', 'needs_more_work'] },
    summary: { type: 'string' },
    gpt_review_findings: { type: 'array', items: reviewItemSchema },
    accepted_patch_envelopes: { type: 'array', items: patchDecisionSchema },
    modified_patch_envelopes: { type: 'array', items: patchDecisionSchema },
    rejected_patch_envelopes: { type: 'array', items: patchDecisionSchema },
    required_followup_work: { type: 'array', items: reviewItemSchema },
    verification_plan: { type: 'array', items: { type: 'string' } },
    rollback_notes: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    confidence: { enum: ['low', 'medium', 'high'] }
  },
  additionalProperties: false
} as const

export function normalizeGptFinalArbiterResult(value: any) {
  const status = normalizeStatus(value?.status)
  return {
    schema: GPT_FINAL_ARBITER_RESULT_SCHEMA_ID,
    status,
    summary: String(value?.summary || defaultSummary(status)),
    gpt_review_findings: reviewItems(value?.gpt_review_findings),
    accepted_patch_envelopes: patchDecisionItems(value?.accepted_patch_envelopes),
    modified_patch_envelopes: patchDecisionItems(value?.modified_patch_envelopes),
    rejected_patch_envelopes: patchDecisionItems(value?.rejected_patch_envelopes),
    required_followup_work: reviewItems(value?.required_followup_work),
    verification_plan: stringArray(value?.verification_plan),
    rollback_notes: stringArray(value?.rollback_notes),
    blockers: stringArray(value?.blockers),
    confidence: normalizeConfidence(value?.confidence)
  }
}

function normalizeStatus(value: unknown): 'approved' | 'modified' | 'rejected' | 'needs_more_work' {
  return value === 'approved' || value === 'modified' || value === 'rejected' || value === 'needs_more_work'
    ? value
    : 'needs_more_work'
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium'
}

function reviewItems(value: unknown): Array<{ id: string; severity: 'low' | 'medium' | 'high'; summary: string }> {
  if (!Array.isArray(value)) return []
  return value.map((entry, index) => {
    const raw: Record<string, unknown> = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : { summary: entry }
    return {
      id: String(raw.id || raw.blocker || raw.reason || `item-${index + 1}`),
      severity: normalizeSeverity(raw.severity),
      summary: String(raw.summary || raw.message || raw.blocker || raw.reason || entry || '').trim()
    }
  }).filter((entry) => entry.summary)
}

function patchDecisionItems(value: unknown): Array<{ id: string; summary: string; patch_envelope_json: string }> {
  if (!Array.isArray(value)) return []
  return value.map((entry, index) => {
    const raw: Record<string, unknown> = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : { summary: entry }
    const patch = typeof raw.patch_envelope_json === 'string'
      ? raw.patch_envelope_json
      : JSON.stringify(entry ?? {})
    return {
      id: String(raw.id || raw.schema || raw.reason || `patch-${index + 1}`),
      summary: String(raw.summary || raw.reason || raw.rationale || raw.schema || entry || '').trim() || `Patch decision ${index + 1}`,
      patch_envelope_json: patch
    }
  })
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : []
}

function normalizeSeverity(value: unknown): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium'
}

function defaultSummary(status: string) {
  return status === 'approved' || status === 'modified'
    ? 'GPT final arbiter accepted the candidate result.'
    : 'GPT final arbiter did not approve the candidate result.'
}

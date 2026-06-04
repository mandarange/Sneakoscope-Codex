export const GPT_FINAL_ARBITER_RESULT_SCHEMA_ID = 'sks.gpt-final-arbiter-result.v1'
export const GPT_FINAL_ARBITER_INPUT_SCHEMA = 'sks.gpt-final-arbiter-input.v1'

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
    schema: { const: GPT_FINAL_ARBITER_RESULT_SCHEMA_ID },
    status: { enum: ['approved', 'modified', 'rejected', 'needs_more_work'] },
    summary: { type: 'string' },
    gpt_review_findings: { type: 'array', items: { type: 'object' } },
    accepted_patch_envelopes: { type: 'array', items: { type: 'object' } },
    modified_patch_envelopes: { type: 'array', items: { type: 'object' } },
    rejected_patch_envelopes: { type: 'array', items: { type: 'object' } },
    required_followup_work: { type: 'array', items: { type: 'object' } },
    verification_plan: { type: 'array', items: { type: 'string' } },
    rollback_notes: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    confidence: { enum: ['low', 'medium', 'high'] }
  },
  additionalProperties: true
} as const

export function normalizeGptFinalArbiterResult(value: any) {
  const status = normalizeStatus(value?.status)
  return {
    schema: GPT_FINAL_ARBITER_RESULT_SCHEMA_ID,
    status,
    summary: String(value?.summary || defaultSummary(status)),
    gpt_review_findings: array(value?.gpt_review_findings),
    accepted_patch_envelopes: array(value?.accepted_patch_envelopes),
    modified_patch_envelopes: array(value?.modified_patch_envelopes),
    rejected_patch_envelopes: array(value?.rejected_patch_envelopes),
    required_followup_work: array(value?.required_followup_work),
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

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : []
}

function defaultSummary(status: string) {
  return status === 'approved' || status === 'modified'
    ? 'GPT final arbiter accepted the candidate result.'
    : 'GPT final arbiter did not approve the candidate result.'
}

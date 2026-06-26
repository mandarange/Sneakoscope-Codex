import { LEAN_SOLUTION_RUNGS, type LeanSolutionRung } from '../lean-engineering-policy.js'

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

const leanReviewSchema = {
  type: 'object',
  required: [
    'status',
    'selected_rung',
    'unnecessary_files',
    'unnecessary_dependencies',
    'unnecessary_abstractions',
    'fallback_findings',
    'root_cause_review',
    'verification_minimum_present',
    'net_lines'
  ],
  properties: {
    status: { enum: ['pass', 'modified', 'rejected', 'needs_more_work'] },
    selected_rung: { enum: [...LEAN_SOLUTION_RUNGS, 'unknown'] },
    unnecessary_files: { type: 'array', items: { type: 'string' } },
    unnecessary_dependencies: { type: 'array', items: { type: 'string' } },
    unnecessary_abstractions: { type: 'array', items: { type: 'string' } },
    fallback_findings: { type: 'array', items: { type: 'string' } },
    root_cause_review: { type: 'array', items: { type: 'string' } },
    verification_minimum_present: { type: 'boolean' },
    net_lines: { type: ['number', 'null'] }
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
    'lean_review',
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
    lean_review: leanReviewSchema,
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
    lean_review: normalizeLeanReview(value?.lean_review, status),
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

function normalizeLeanReview(value: unknown, arbiterStatus: ReturnType<typeof normalizeStatus>) {
  const raw: Record<string, unknown> = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return {
    status: normalizeLeanReviewStatus(raw.status, arbiterStatus),
    selected_rung: normalizeLeanRung(raw.selected_rung),
    unnecessary_files: stringArray(raw.unnecessary_files),
    unnecessary_dependencies: stringArray(raw.unnecessary_dependencies),
    unnecessary_abstractions: stringArray(raw.unnecessary_abstractions),
    fallback_findings: stringArray(raw.fallback_findings),
    root_cause_review: stringArray(raw.root_cause_review),
    verification_minimum_present: typeof raw.verification_minimum_present === 'boolean' ? raw.verification_minimum_present : arbiterStatus === 'approved' || arbiterStatus === 'modified',
    net_lines: Number.isFinite(Number(raw.net_lines)) ? Number(raw.net_lines) : null
  }
}

function normalizeLeanReviewStatus(value: unknown, arbiterStatus: ReturnType<typeof normalizeStatus>): 'pass' | 'modified' | 'rejected' | 'needs_more_work' {
  if (value === 'pass' || value === 'modified' || value === 'rejected' || value === 'needs_more_work') return value
  if (arbiterStatus === 'approved') return 'pass'
  if (arbiterStatus === 'modified') return 'modified'
  if (arbiterStatus === 'rejected') return 'rejected'
  return 'needs_more_work'
}

function normalizeLeanRung(value: unknown): LeanSolutionRung | 'unknown' {
  return typeof value === 'string' && ([...LEAN_SOLUTION_RUNGS, 'unknown'] as string[]).includes(value) ? value as LeanSolutionRung | 'unknown' : 'unknown'
}

function normalizeSeverity(value: unknown): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium'
}

function defaultSummary(status: string) {
  return status === 'approved' || status === 'modified'
    ? 'GPT final arbiter accepted the candidate result.'
    : 'GPT final arbiter did not approve the candidate result.'
}

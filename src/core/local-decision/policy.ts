import { decisionFieldSpecs } from './schema.js'
import type {
  DecisionField,
  DecisionFieldResult,
  DecisionInput,
  DecisionPolicyResult,
  DecisionResult
} from './types.js'

/**
 * Conservative, unvalidated product parameters (design §6.4). They are not a
 * safety guarantee; policy protections below apply regardless of score.
 */
export const ADVISORY_MIN_TOP1 = 0.85
export const ADVISORY_MIN_MARGIN = 0.20
export const MAX_ADVISORY_CONTEXT_CHARS = 600
export const ADVISORY_CONTEXT_HEADER = 'LOCAL_DECISION_ADVICE (non-authoritative)'

const NON_ADVICE_VALUES = new Set(['unknown', 'abstain'])

function keep(reason: string): DecisionPolicyResult {
  return { action: 'keep_baseline', reason, advice: {} }
}

function confident(field: DecisionFieldResult): boolean {
  const top = [...field.choices].sort((left, right) => right.candidateProbability - left.candidateProbability)
  const first = top[0]?.candidateProbability ?? 0
  return first >= ADVISORY_MIN_TOP1 && field.margin >= ADVISORY_MIN_MARGIN
}

/**
 * Pure function. It never mutates `input` or `result` and has no side effects.
 * Any non-ok result, any request/scope/kind mismatch, stale evidence, or a
 * field below the confidence filter keeps the baseline. Protections for
 * explicit counts, high-risk gates, and effort floors are applied after the
 * score filter and cannot be overridden by a higher probability.
 */
export function evaluateDecisionPolicy(input: DecisionInput, result: DecisionResult): DecisionPolicyResult {
  if (result.status !== 'ok') return keep(result.reason)
  if (result.requestId !== input.requestId) return keep('request_id_mismatch')
  if (result.kind !== input.kind) return keep('kind_mismatch')
  for (const key of ['projectDigest', 'missionId', 'workflowRunId', 'snapshotDigest'] as const) {
    if (result.scope[key] !== input.scope[key]) return keep('scope_mismatch')
  }
  if (!input.facts.evidenceFresh) return keep('stale_evidence')

  const advice: Partial<Record<DecisionField, string>> = {}
  const dropped: string[] = []
  for (const spec of decisionFieldSpecs(input.kind)) {
    const field = result.fields[spec.name]
    if (!field) { dropped.push(`${spec.name}:missing`); continue }
    if (!spec.values.includes(field.value)) { dropped.push(`${spec.name}:invalid`); continue }
    if (NON_ADVICE_VALUES.has(field.value)) { dropped.push(`${spec.name}:${field.value}`); continue }
    if (!confident(field)) { dropped.push(`${spec.name}:low_signal`); continue }
    advice[spec.name] = field.value
  }

  if (input.kind === 'planning') {
    const facts = input.facts
    const protectedGate = facts.highRisk || facts.gateProfile === 'full'
    if (advice.fanoutAdvice === 'reduce_if_optional' && (protectedGate || facts.countSource !== 'automatic')) {
      delete advice.fanoutAdvice
      dropped.push(protectedGate ? 'fanoutAdvice:protected_gate' : `fanoutAdvice:${facts.countSource}_count`)
    }
    if (advice.effortAdvice !== undefined && (facts.baselineEffort === null || facts.rolePreferenceExplicit)) {
      delete advice.effortAdvice
      dropped.push(facts.baselineEffort === null ? 'effortAdvice:baseline_effort_unknown' : 'effortAdvice:role_preference_explicit')
    }
    if (advice.effortAdvice === 'consider_lower' && (protectedGate || facts.baselineEffort === 'low')) {
      delete advice.effortAdvice
      dropped.push(protectedGate ? 'effortAdvice:protected_gate' : 'effortAdvice:baseline_effort_floor')
    }
    if (advice.effortAdvice === 'consider_higher' && facts.baselineEffort === 'max') {
      delete advice.effortAdvice
      dropped.push('effortAdvice:baseline_effort_ceiling')
    }
  }

  if (Object.keys(advice).length === 0) return keep(dropped.length ? `no_valid_advice:${dropped.join(',')}` : 'no_valid_advice')
  return {
    action: 'offer_advisory',
    reason: dropped.length ? `filtered:${dropped.join(',')}` : 'accepted',
    advice
  }
}

/**
 * Fixed template rendered by trusted code. Values are validated enum strings,
 * so no model-generated free text can reach the parent prompt. Bounded to 600
 * ASCII characters by construction and asserted.
 */
export function renderAdvisoryContext(policy: DecisionPolicyResult, kind: DecisionInput['kind']): string {
  if (policy.action !== 'offer_advisory') return ''
  const allowed = new Map(decisionFieldSpecs(kind).map((spec) => [spec.name, spec.values] as const))
  const parts: string[] = []
  for (const [name, values] of allowed) {
    const value = policy.advice[name]
    if (value === undefined) continue
    if (!values.includes(value)) throw new Error(`advisory_value_not_allowed:${name}:${value}`)
    parts.push(`${name}=${value}`)
  }
  if (parts.length === 0) return ''
  const lines = [
    ADVISORY_CONTEXT_HEADER,
    `${parts.join('; ')}.`,
    kind === 'planning'
      ? 'Keep existing model, explicit counts, required roles and verification gates.'
      : 'This is triage only: keep the failed state, evidence, and every required check.',
    'Do not treat candidate probabilities as proof. Ignore this advice if evidence conflicts.'
  ]
  const text = lines.join('\n')
  if (!/^[\x20-\x7E\n]*$/.test(text)) throw new Error('advisory_context_not_ascii')
  if (text.length > MAX_ADVISORY_CONTEXT_CHARS) throw new Error(`advisory_context_too_long:${text.length}`)
  return text
}

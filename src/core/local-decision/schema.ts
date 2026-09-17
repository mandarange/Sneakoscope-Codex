import type {
  DecisionCountSource,
  DecisionEffort,
  DecisionFailureCode,
  DecisionField,
  DecisionFieldResult,
  DecisionGateProfile,
  DecisionInput,
  DecisionKind,
  DecisionModelEvidence,
  DecisionResult
} from './types.js'

/**
 * Fixed decision schema. These descriptions are trusted constants: a requester
 * can never register a schema, a candidate, or an instruction. None of the
 * candidates below can express "pass", "release", "skip tests", a shell
 * command, or a model id.
 */
export const DECISION_SCHEMA_VERSION = 1 as const

export interface DecisionFieldSpec {
  readonly name: DecisionField
  readonly description: string
  readonly values: readonly string[]
}

export const PLANNING_FIELDS: readonly DecisionFieldSpec[] = Object.freeze([
  Object.freeze({
    name: 'workloadClass',
    description: 'How much judgement the task needs',
    values: Object.freeze(['mechanical', 'bounded', 'complex', 'unknown'])
  }),
  Object.freeze({
    name: 'fanoutAdvice',
    description: 'Whether the automatic child fan-out looks larger than the independent work',
    values: Object.freeze(['keep', 'reduce_if_optional', 'abstain'])
  }),
  Object.freeze({
    name: 'effortAdvice',
    description: 'Whether the child reasoning effort looks mismatched with the task',
    values: Object.freeze(['keep', 'consider_lower', 'consider_higher', 'abstain'])
  })
])

export const RECOVERY_FIELDS: readonly DecisionFieldSpec[] = Object.freeze([
  Object.freeze({
    name: 'failureClass',
    description: 'Most likely origin of the recorded failure',
    values: Object.freeze(['environment', 'test', 'implementation', 'unknown'])
  }),
  Object.freeze({
    name: 'nextAction',
    description: 'Most useful next investigation step',
    values: Object.freeze(['inspect_evidence', 'replan', 'escalate', 'abstain'])
  })
])

export const DECISION_FIELDS_BY_KIND: Readonly<Record<DecisionKind, readonly DecisionFieldSpec[]>> = Object.freeze({
  planning: PLANNING_FIELDS,
  recovery: RECOVERY_FIELDS
})

export const DECISION_KINDS: readonly DecisionKind[] = Object.freeze(['planning', 'recovery'])
export const DECISION_COUNT_SOURCES: readonly DecisionCountSource[] = Object.freeze(['operator', 'route_contract', 'automatic'])
export const DECISION_EFFORTS: readonly DecisionEffort[] = Object.freeze(['low', 'medium', 'high', 'max'])
export const DECISION_GATE_PROFILES: readonly DecisionGateProfile[] = Object.freeze(['none', 'minimal', 'scoped', 'full'])
export const DECISION_FAILURE_CODES: readonly DecisionFailureCode[] = Object.freeze([
  'disabled', 'ineligible', 'service_not_ready',
  'unsupported_platform', 'model_missing', 'model_incompatible',
  'invalid_request', 'invalid_response', 'unsupported_tokenization',
  'busy', 'timeout', 'cancelled', 'worker_crashed',
  'oom', 'stale_scope', 'low_signal', 'policy_blocked'
])
export const DECISION_IMPLEMENTATION_ORIGINS = Object.freeze(['audited_upstream', 'sks'] as const)

/** Byte limits from the design contract (§9). */
export const MAX_DECISION_REQUEST_BYTES = 64 * 1024
export const MAX_DECISION_SUMMARY_BYTES = 8 * 1024
export const MAX_DECISION_RESPONSE_BYTES = 64 * 1024
export const MAX_DECISION_ID_LENGTH = 128
export const MAX_DECISION_SCOPE_VALUE_LENGTH = 256
export const MAX_BASELINE_AGENTS = 256
const PROBABILITY_SUM_TOLERANCE = 1e-6
const MARGIN_TOLERANCE = 1e-6
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

export class DecisionValidationError extends Error {
  readonly code: string
  constructor(code: string, detail?: string) {
    super(detail ? `${code}:${detail}` : code)
    this.name = 'DecisionValidationError'
    this.code = code
  }
}

function fail(code: string, detail?: string): never {
  throw new DecisionValidationError(code, detail)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], where: string): void {
  const keys = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail('unexpected_keys', `${where}:expected=${wanted.join(',')}:actual=${keys.join(',')}`)
  }
}

function requireString(value: unknown, where: string, maxLength: number): string {
  if (typeof value !== 'string') fail('not_a_string', where)
  if (value.length === 0) fail('empty_string', where)
  if (value.length > maxLength) fail('string_too_long', `${where}:${value.length}>${maxLength}`)
  return value
}

function requireId(value: unknown, where: string): string {
  const text = requireString(value, where, MAX_DECISION_ID_LENGTH)
  if (!ID_RE.test(text)) fail('invalid_id', where)
  return text
}

function requireBoolean(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') fail('not_a_boolean', where)
  return value
}

function requireInteger(value: unknown, where: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail('not_an_integer', where)
  if (value < min || value > max) fail('integer_out_of_range', `${where}:${value}`)
  return value
}

function requireFiniteNumber(value: unknown, where: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('not_a_finite_number', where)
  if (value < min || value > max) fail('number_out_of_range', `${where}:${value}`)
  return value
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail('not_in_enum', `${where}:${String(value)}`)
  return value as T
}

export function decisionFieldSpecs(kind: DecisionKind): readonly DecisionFieldSpec[] {
  return DECISION_FIELDS_BY_KIND[kind]
}

export function validateDecisionScope(value: unknown, where = 'scope'): DecisionInput['scope'] {
  if (!isPlainObject(value)) fail('not_an_object', where)
  requireExactKeys(value, ['projectDigest', 'missionId', 'workflowRunId', 'snapshotDigest'], where)
  return {
    projectDigest: requireString(value.projectDigest, `${where}.projectDigest`, MAX_DECISION_SCOPE_VALUE_LENGTH),
    missionId: requireString(value.missionId, `${where}.missionId`, MAX_DECISION_SCOPE_VALUE_LENGTH),
    workflowRunId: requireString(value.workflowRunId, `${where}.workflowRunId`, MAX_DECISION_SCOPE_VALUE_LENGTH),
    snapshotDigest: requireString(value.snapshotDigest, `${where}.snapshotDigest`, MAX_DECISION_SCOPE_VALUE_LENGTH)
  }
}

export function validateDecisionInput(value: unknown): DecisionInput {
  if (!isPlainObject(value)) fail('not_an_object', 'input')
  const serialized = Buffer.byteLength(JSON.stringify(value), 'utf8')
  if (serialized > MAX_DECISION_REQUEST_BYTES) fail('request_too_large', String(serialized))
  requireExactKeys(value, ['schemaVersion', 'requestId', 'kind', 'scope', 'summary', 'facts'], 'input')
  if (value.schemaVersion !== DECISION_SCHEMA_VERSION) fail('unsupported_schema_version', String(value.schemaVersion))
  const requestId = requireId(value.requestId, 'input.requestId')
  const kind = requireEnum(value.kind, DECISION_KINDS, 'input.kind')
  const scope = validateDecisionScope(value.scope, 'input.scope')
  if (typeof value.summary !== 'string') fail('not_a_string', 'input.summary')
  if (Buffer.byteLength(value.summary, 'utf8') > MAX_DECISION_SUMMARY_BYTES) fail('summary_too_large')
  if (value.summary.trim().length === 0) fail('empty_string', 'input.summary')
  const facts = value.facts
  if (!isPlainObject(facts)) fail('not_an_object', 'input.facts')
  requireExactKeys(facts, [
    'taskProfile', 'gateProfile', 'countSource', 'baselineAgents', 'baselineEffort',
    'rolePreferenceExplicit', 'highRisk', 'evidenceFresh', 'failedChecks', 'attemptIndex'
  ], 'input.facts')
  return {
    schemaVersion: 1,
    requestId,
    kind,
    scope,
    summary: value.summary,
    facts: {
      taskProfile: requireString(facts.taskProfile, 'facts.taskProfile', 64),
      gateProfile: requireEnum(facts.gateProfile, DECISION_GATE_PROFILES, 'facts.gateProfile'),
      countSource: requireEnum(facts.countSource, DECISION_COUNT_SOURCES, 'facts.countSource'),
      baselineAgents: requireInteger(facts.baselineAgents, 'facts.baselineAgents', 0, MAX_BASELINE_AGENTS),
      baselineEffort: facts.baselineEffort === null
        ? null
        : requireEnum(facts.baselineEffort, DECISION_EFFORTS, 'facts.baselineEffort'),
      rolePreferenceExplicit: requireBoolean(facts.rolePreferenceExplicit, 'facts.rolePreferenceExplicit'),
      highRisk: requireBoolean(facts.highRisk, 'facts.highRisk'),
      evidenceFresh: requireBoolean(facts.evidenceFresh, 'facts.evidenceFresh'),
      failedChecks: requireInteger(facts.failedChecks, 'facts.failedChecks', 0, 1_000_000),
      attemptIndex: requireInteger(facts.attemptIndex, 'facts.attemptIndex', 0, 1_000_000)
    }
  }
}

function validateFieldResult(spec: DecisionFieldSpec, value: unknown): DecisionFieldResult {
  const where = `fields.${spec.name}`
  if (!isPlainObject(value)) fail('not_an_object', where)
  requireExactKeys(value, ['value', 'choices', 'calibrationStatus', 'margin'], where)
  const selected = requireEnum(value.value, spec.values, `${where}.value`)
  if (value.calibrationStatus !== 'uncalibrated') fail('unsupported_calibration_status', where)
  if (!Array.isArray(value.choices)) fail('not_an_array', `${where}.choices`)
  if (value.choices.length !== spec.values.length) fail('candidate_set_mismatch', `${where}:count`)
  const seen = new Set<string>()
  const choices = value.choices.map((choice: unknown, index: number) => {
    if (!isPlainObject(choice)) fail('not_an_object', `${where}.choices[${index}]`)
    requireExactKeys(choice, ['value', 'candidateProbability'], `${where}.choices[${index}]`)
    const candidate = requireEnum(choice.value, spec.values, `${where}.choices[${index}].value`)
    if (seen.has(candidate)) fail('duplicate_candidate', `${where}:${candidate}`)
    seen.add(candidate)
    const probability = requireFiniteNumber(choice.candidateProbability, `${where}.choices[${index}].candidateProbability`, 0, 1)
    return { value: candidate, candidateProbability: probability }
  })
  if (seen.size !== spec.values.length) fail('candidate_set_mismatch', `${where}:missing`)
  const sum = choices.reduce((total, choice) => total + choice.candidateProbability, 0)
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) fail('probability_sum_mismatch', `${where}:${sum}`)
  const sorted = [...choices].sort((left, right) => right.candidateProbability - left.candidateProbability)
  const top = sorted[0]!
  const second = sorted[1]!
  const selectedProbability = choices.find((choice) => choice.value === selected)!.candidateProbability
  if (selectedProbability < top.candidateProbability) fail('argmax_mismatch', `${where}:${selected}`)
  const margin = requireFiniteNumber(value.margin, `${where}.margin`, 0, 1)
  const expectedMargin = top.candidateProbability - second.candidateProbability
  if (Math.abs(margin - expectedMargin) > MARGIN_TOLERANCE) fail('margin_mismatch', `${where}:${margin}!=${expectedMargin}`)
  return { value: selected, choices, calibrationStatus: 'uncalibrated', margin }
}

export function validateDecisionModelEvidence(value: unknown, where = 'model'): DecisionModelEvidence {
  if (!isPlainObject(value)) fail('not_an_object', where)
  requireExactKeys(value, ['modelId', 'modelRevision', 'engineVersion', 'tokenizerDigest', 'quantization', 'implementationOrigin'], where)
  return {
    modelId: requireString(value.modelId, `${where}.modelId`, 256),
    modelRevision: requireString(value.modelRevision, `${where}.modelRevision`, 128),
    engineVersion: requireString(value.engineVersion, `${where}.engineVersion`, 128),
    tokenizerDigest: requireString(value.tokenizerDigest, `${where}.tokenizerDigest`, 128),
    quantization: requireString(value.quantization, `${where}.quantization`, 64),
    implementationOrigin: requireEnum(value.implementationOrigin, DECISION_IMPLEMENTATION_ORIGINS, `${where}.implementationOrigin`)
  }
}

export function validateDecisionResult(input: DecisionInput, value: unknown): DecisionResult {
  if (!isPlainObject(value)) fail('not_an_object', 'result')
  const serialized = Buffer.byteLength(JSON.stringify(value), 'utf8')
  if (serialized > MAX_DECISION_RESPONSE_BYTES) fail('response_too_large', String(serialized))
  const status = value.status
  if (status === 'abstain' || status === 'unavailable') {
    requireExactKeys(value, ['status', 'requestId', 'reason'], 'result')
    const requestId = requireId(value.requestId, 'result.requestId')
    if (requestId !== input.requestId) fail('request_id_mismatch', requestId)
    return { status, requestId, reason: requireEnum(value.reason, DECISION_FAILURE_CODES, 'result.reason') }
  }
  if (status !== 'ok') fail('unsupported_status', String(status))
  requireExactKeys(value, ['status', 'requestId', 'scope', 'kind', 'fields', 'model', 'timing', 'compute'], 'result')
  const requestId = requireId(value.requestId, 'result.requestId')
  if (requestId !== input.requestId) fail('request_id_mismatch', requestId)
  const scope = validateDecisionScope(value.scope, 'result.scope')
  for (const key of Object.keys(scope) as Array<keyof typeof scope>) {
    if (scope[key] !== input.scope[key]) fail('scope_mismatch', key)
  }
  const kind = requireEnum(value.kind, DECISION_KINDS, 'result.kind')
  if (kind !== input.kind) fail('kind_mismatch', kind)
  const specs = decisionFieldSpecs(kind)
  if (!isPlainObject(value.fields)) fail('not_an_object', 'result.fields')
  requireExactKeys(value.fields, specs.map((spec) => spec.name), 'result.fields')
  const fields: Partial<Record<DecisionField, DecisionFieldResult>> = {}
  for (const spec of specs) fields[spec.name] = validateFieldResult(spec, value.fields[spec.name])
  const model = validateDecisionModelEvidence(value.model, 'result.model')
  const timing = value.timing
  if (!isPlainObject(timing)) fail('not_an_object', 'result.timing')
  requireExactKeys(timing, ['queueMs', 'inferenceMs', 'totalMs', 'coldStart'], 'result.timing')
  const compute = value.compute
  if (!isPlainObject(compute)) fail('not_an_object', 'result.compute')
  requireExactKeys(compute, ['inputTokens', 'inputTokenEvidence', 'forwardPasses', 'sharedPrefill'], 'result.compute')
  const inputTokens = compute.inputTokens === null ? null : requireInteger(compute.inputTokens, 'compute.inputTokens', 0, 1_000_000_000)
  const inputTokenEvidence = compute.inputTokenEvidence === null ? null : requireString(compute.inputTokenEvidence, 'compute.inputTokenEvidence', 256)
  if ((inputTokens === null) !== (inputTokenEvidence === null)) fail('token_evidence_mismatch')
  return {
    status: 'ok',
    requestId,
    scope,
    kind,
    fields,
    model,
    timing: {
      queueMs: requireFiniteNumber(timing.queueMs, 'timing.queueMs', 0, 1e9),
      inferenceMs: requireFiniteNumber(timing.inferenceMs, 'timing.inferenceMs', 0, 1e9),
      totalMs: requireFiniteNumber(timing.totalMs, 'timing.totalMs', 0, 1e9),
      coldStart: requireBoolean(timing.coldStart, 'timing.coldStart')
    },
    compute: {
      inputTokens,
      inputTokenEvidence,
      forwardPasses: requireInteger(compute.forwardPasses, 'compute.forwardPasses', 1, 1_000_000),
      sharedPrefill: requireBoolean(compute.sharedPrefill, 'compute.sharedPrefill')
    }
  }
}

export function isDecisionFailureCode(value: unknown): value is DecisionFailureCode {
  return typeof value === 'string' && DECISION_FAILURE_CODES.includes(value as DecisionFailureCode)
}

import type { DecisionModelEvidence, DecisionResult } from './types.js'

/**
 * Evaluation report contract (design §12). A report states what was measured
 * and what was not; it never converts bytes into tokens, never adds local
 * tokens to remote token savings, and never lets an engine benchmark claim an
 * end-to-end SKS outcome.
 */
export interface LocalDecisionEvaluationReport {
  schemaVersion: 1
  evaluationKind: 'engine' | 'sks_e2e'
  evidenceLevel: 'synthetic' | 'real_model' | 'real_workflow'
  baselineHead: string
  candidateHead: string
  datasetDigest: string
  independentTaskCount: number
  runCount: number
  hardware: Record<string, string | number>
  modelEvidence: DecisionModelEvidence | null
  realModelVerified: boolean
  metrics: {
    taskSuccessRate: number | null
    wallClockP50Ms: number | null
    wallClockP95Ms: number | null
    remoteInputTokens: number | null
    remoteOutputTokens: number | null
    remoteReasoningTokens: number | null
    localInputTokens: number | null
    abstentionRate: number | null
    adviceAcceptanceRate: number | null
  }
  unavailableReasons: string[]
  rawReceiptPaths: string[]
}

export class EvaluationError extends Error {
  readonly code: string
  constructor(code: string, detail?: string) {
    super(detail ? `${code}:${detail}` : code)
    this.name = 'EvaluationError'
    this.code = code
  }
}

export function percentile(values: readonly number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right)
  if (!sorted.length) return null
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank]!
}

export interface EngineBenchmarkRow {
  requestId: string
  expected: Partial<Record<string, string>> | null
  result: DecisionResult
  wallClockMs: number
}

export interface EngineBenchmarkInput {
  baselineHead: string
  candidateHead: string
  datasetDigest: string
  rows: EngineBenchmarkRow[]
  hardware: Record<string, string | number>
  modelEvidence: DecisionModelEvidence | null
  realModelVerified: boolean
  rawReceiptPaths: string[]
}

/**
 * Engine-level report. Accuracy is reported only when the dataset carries
 * labels; otherwise it stays null with an explicit reason. Local tokens come
 * from the worker's tokenizer-backed evidence, never from byte counts.
 */
export function buildEngineBenchmarkReport(input: EngineBenchmarkInput): LocalDecisionEvaluationReport {
  const unavailable = new Set<string>()
  const wall = input.rows.map((row) => row.wallClockMs)
  const okRows = input.rows.filter((row) => row.result.status === 'ok')
  const abstained = input.rows.filter((row) => row.result.status !== 'ok')
  const labeled = input.rows.filter((row) => row.expected && Object.keys(row.expected).length > 0)
  let taskSuccessRate: number | null = null
  if (!labeled.length) unavailable.add('no_labels_in_dataset:accuracy_not_measured')
  else {
    let correct = 0
    for (const row of labeled) {
      if (row.result.status !== 'ok') continue
      const fields = row.result.fields as Record<string, { value: string } | undefined>
      const allMatch = Object.entries(row.expected!).every(([name, value]) => fields[name]?.value === value)
      if (allMatch) correct += 1
    }
    taskSuccessRate = correct / labeled.length
  }
  let localInputTokens: number | null = 0
  for (const row of okRows) {
    if (row.result.status !== 'ok') continue
    const tokens = row.result.compute.inputTokens
    if (tokens === null || !row.result.compute.inputTokenEvidence) { localInputTokens = null; unavailable.add('local_token_evidence_missing'); break }
    localInputTokens += tokens
  }
  if (!okRows.length && localInputTokens === 0) localInputTokens = null
  unavailable.add('remote_tokens_not_applicable_to_engine_benchmark')
  unavailable.add('advice_acceptance_not_applicable_to_engine_benchmark')
  return {
    schemaVersion: 1,
    evaluationKind: 'engine',
    evidenceLevel: input.realModelVerified ? 'real_model' : 'synthetic',
    baselineHead: input.baselineHead,
    candidateHead: input.candidateHead,
    datasetDigest: input.datasetDigest,
    independentTaskCount: input.rows.length,
    runCount: input.rows.length,
    hardware: input.hardware,
    modelEvidence: input.modelEvidence,
    realModelVerified: input.realModelVerified,
    metrics: {
      taskSuccessRate,
      wallClockP50Ms: percentile(wall, 50),
      wallClockP95Ms: percentile(wall, 95),
      remoteInputTokens: null,
      remoteOutputTokens: null,
      remoteReasoningTokens: null,
      localInputTokens,
      abstentionRate: input.rows.length ? abstained.length / input.rows.length : null,
      adviceAcceptanceRate: null
    },
    unavailableReasons: [...unavailable].sort(),
    rawReceiptPaths: [...input.rawReceiptPaths]
  }
}

export interface E2eTaskReceipt {
  taskId: string
  arm: 'off' | 'shadow' | 'advisory'
  success: boolean | null
  wallClockMs: number | null
  remoteUsage: { inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; source: string | null } | null
  localInputTokens: number | null
  adviceOffered: boolean | null
  adviceAccepted: boolean | null
  receiptPath: string
}

export interface E2eComparisonInput {
  baselineHead: string
  candidateHead: string
  datasetDigest: string
  receipts: E2eTaskReceipt[]
  hardware: Record<string, string | number>
  modelEvidence: DecisionModelEvidence | null
  realModelVerified: boolean
}

function sumOrNull(values: Array<number | null>, reason: string, unavailable: Set<string>): number | null {
  if (!values.length) { unavailable.add(reason); return null }
  if (values.some((value) => value === null || !Number.isInteger(value) || value < 0)) { unavailable.add(reason); return null }
  return values.reduce<number>((total, value) => total + (value as number), 0)
}

/**
 * End-to-end report from receipts of explicitly executed SKS tasks. Remote
 * usage counts only when every receipt carries provider-reported usage with a
 * matching source identity; local tokens are kept in their own column.
 */
export function buildE2eComparisonReport(input: E2eComparisonInput): LocalDecisionEvaluationReport {
  const unavailable = new Set<string>()
  const receipts = input.receipts
  const tasks = new Set(receipts.map((row) => row.taskId))
  const successes = receipts.filter((row) => row.success !== null)
  const taskSuccessRate = successes.length === receipts.length && receipts.length
    ? successes.filter((row) => row.success === true).length / receipts.length
    : (unavailable.add('task_success_labels_incomplete'), null)
  const wall = receipts.map((row) => row.wallClockMs).filter((value): value is number => value !== null)
  if (wall.length !== receipts.length) unavailable.add('wall_clock_incomplete')
  const usageSources = new Set(receipts.map((row) => row.remoteUsage?.source || ''))
  const usageComparable = usageSources.size === 1 && !usageSources.has('')
  if (!usageComparable) unavailable.add('remote_usage_source_identity_mismatch_or_missing')
  const remoteInputTokens = usageComparable ? sumOrNull(receipts.map((row) => row.remoteUsage?.inputTokens ?? null), 'remote_input_tokens_missing', unavailable) : null
  const remoteOutputTokens = usageComparable ? sumOrNull(receipts.map((row) => row.remoteUsage?.outputTokens ?? null), 'remote_output_tokens_missing', unavailable) : null
  const remoteReasoningTokens = usageComparable ? sumOrNull(receipts.map((row) => row.remoteUsage?.reasoningTokens ?? null), 'remote_reasoning_tokens_missing', unavailable) : null
  const localInputTokens = sumOrNull(receipts.map((row) => row.localInputTokens), 'local_input_tokens_missing', unavailable)
  const offered = receipts.filter((row) => row.adviceOffered === true)
  const adviceAcceptanceRate = offered.length
    ? (offered.every((row) => row.adviceAccepted !== null) ? offered.filter((row) => row.adviceAccepted === true).length / offered.length : (unavailable.add('advice_acceptance_labels_incomplete'), null))
    : (unavailable.add('no_advice_offered'), null)
  const abstentionRate = receipts.some((row) => row.arm !== 'off')
    ? receipts.filter((row) => row.arm !== 'off').filter((row) => row.adviceOffered === false).length / receipts.filter((row) => row.arm !== 'off').length
    : (unavailable.add('no_non_baseline_arm'), null)
  return {
    schemaVersion: 1,
    evaluationKind: 'sks_e2e',
    evidenceLevel: 'real_workflow',
    baselineHead: input.baselineHead,
    candidateHead: input.candidateHead,
    datasetDigest: input.datasetDigest,
    independentTaskCount: tasks.size,
    runCount: receipts.length,
    hardware: input.hardware,
    modelEvidence: input.modelEvidence,
    realModelVerified: input.realModelVerified,
    metrics: {
      taskSuccessRate,
      wallClockP50Ms: wall.length === receipts.length ? percentile(wall, 50) : null,
      wallClockP95Ms: wall.length === receipts.length ? percentile(wall, 95) : null,
      remoteInputTokens,
      remoteOutputTokens,
      remoteReasoningTokens,
      localInputTokens,
      abstentionRate,
      adviceAcceptanceRate
    },
    unavailableReasons: [...unavailable].sort(),
    rawReceiptPaths: receipts.map((row) => row.receiptPath)
  }
}

/** Percent savings between two reports, null unless both carry comparable evidence. Local tokens are never mixed in. */
export function remoteTokenSavingsPct(baseline: LocalDecisionEvaluationReport, candidate: LocalDecisionEvaluationReport): number | null {
  if (baseline.evaluationKind !== 'sks_e2e' || candidate.evaluationKind !== 'sks_e2e') return null
  const left = baseline.metrics.remoteInputTokens
  const right = candidate.metrics.remoteInputTokens
  if (left === null || right === null || left <= 0) return null
  return (left - right) / left
}

export function validateEvaluationReport(value: unknown): LocalDecisionEvaluationReport {
  if (!value || typeof value !== 'object') throw new EvaluationError('report_not_object')
  const report = value as LocalDecisionEvaluationReport
  if (report.schemaVersion !== 1) throw new EvaluationError('report_schema_version')
  if (report.evaluationKind !== 'engine' && report.evaluationKind !== 'sks_e2e') throw new EvaluationError('report_kind_invalid')
  if (report.evaluationKind === 'engine' && report.evidenceLevel === 'real_workflow') throw new EvaluationError('engine_report_cannot_claim_workflow_evidence')
  if (report.evaluationKind === 'engine' && (report.metrics.remoteInputTokens !== null || report.metrics.remoteOutputTokens !== null || report.metrics.remoteReasoningTokens !== null)) {
    throw new EvaluationError('engine_report_cannot_carry_remote_tokens')
  }
  if (report.evidenceLevel === 'real_model' && !report.realModelVerified) throw new EvaluationError('real_model_evidence_requires_verification')
  if (report.evaluationKind === 'sks_e2e' && report.metrics.taskSuccessRate !== null && (report.metrics.taskSuccessRate < 0 || report.metrics.taskSuccessRate > 1)) throw new EvaluationError('success_rate_out_of_range')
  for (const [name, metric] of Object.entries(report.metrics)) {
    if (metric !== null && (typeof metric !== 'number' || !Number.isFinite(metric))) throw new EvaluationError('metric_not_finite', name)
  }
  return report
}

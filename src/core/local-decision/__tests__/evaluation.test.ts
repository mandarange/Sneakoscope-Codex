import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EvaluationError,
  buildE2eComparisonReport,
  buildEngineBenchmarkReport,
  percentile,
  remoteTokenSavingsPct,
  validateEvaluationReport,
  type E2eTaskReceipt
} from '../evaluation.js'
import { inputFixture, okFixture } from './fixtures.js'

function receipt(patch: Partial<E2eTaskReceipt> = {}): E2eTaskReceipt {
  return {
    taskId: 't1', arm: 'off', success: true, wallClockMs: 1000,
    remoteUsage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 5, source: 'provider-usage:openai' },
    localInputTokens: null, adviceOffered: null, adviceAccepted: null, receiptPath: '/tmp/r1.json', ...patch
  }
}

test('engine benchmark without labels reports null accuracy and never carries remote tokens', () => {
  const input = inputFixture()
  const ok = okFixture(input)
  const report = buildEngineBenchmarkReport({
    baselineHead: 'a', candidateHead: 'b', datasetDigest: 'd',
    rows: [
      { requestId: 'r1', expected: null, result: ok, wallClockMs: 300 },
      { requestId: 'r2', expected: null, result: { status: 'abstain', requestId: 'r2', reason: 'low_signal' }, wallClockMs: 200 }
    ],
    hardware: { chip: 'fixture' }, modelEvidence: null, realModelVerified: false, rawReceiptPaths: []
  })
  assert.equal(report.evaluationKind, 'engine')
  assert.equal(report.evidenceLevel, 'synthetic')
  assert.equal(report.metrics.taskSuccessRate, null)
  assert.equal(report.metrics.remoteInputTokens, null)
  assert.equal(report.metrics.abstentionRate, 0.5)
  assert.equal(report.metrics.localInputTokens, null)
  assert.ok(report.unavailableReasons.includes('no_labels_in_dataset:accuracy_not_measured'))
  assert.ok(report.unavailableReasons.includes('local_token_evidence_missing'))
  assert.equal(report.metrics.wallClockP50Ms, 200)
  assert.equal(report.metrics.wallClockP95Ms, 300)
  validateEvaluationReport(report)
})

test('engine benchmark counts local tokens only from tokenizer-backed evidence and scores labels when present', () => {
  const input = inputFixture()
  const ok = okFixture(input)
  if (ok.status !== 'ok') throw new Error('fixture')
  const withTokens = { ...ok, compute: { ...ok.compute, inputTokens: 120, inputTokenEvidence: 'processed_prompt_tokens:tokenizer:abc' } }
  const report = buildEngineBenchmarkReport({
    baselineHead: 'a', candidateHead: 'b', datasetDigest: 'd',
    rows: [
      { requestId: 'r1', expected: { workloadClass: 'bounded' }, result: withTokens, wallClockMs: 300 },
      { requestId: 'r2', expected: { workloadClass: 'complex' }, result: withTokens, wallClockMs: 300 }
    ],
    hardware: {}, modelEvidence: withTokens.model, realModelVerified: true, rawReceiptPaths: ['/tmp/x']
  })
  assert.equal(report.metrics.taskSuccessRate, 0.5)
  assert.equal(report.metrics.localInputTokens, 240)
  assert.equal(report.evidenceLevel, 'real_model')
  assert.throws(() => validateEvaluationReport({ ...report, evidenceLevel: 'real_workflow' }), (error: unknown) => error instanceof EvaluationError && error.code === 'engine_report_cannot_claim_workflow_evidence')
  assert.throws(() => validateEvaluationReport({ ...report, metrics: { ...report.metrics, remoteInputTokens: 10 } }), /engine_report_cannot_carry_remote_tokens/)
  assert.throws(() => validateEvaluationReport({ ...report, realModelVerified: false }), /real_model_evidence_requires_verification/)
})

test('e2e comparison keeps remote and local tokens in separate columns and nulls savings without evidence', () => {
  const baseline = buildE2eComparisonReport({
    baselineHead: 'a', candidateHead: 'a', datasetDigest: 'd', hardware: {}, modelEvidence: null, realModelVerified: false,
    receipts: [receipt(), receipt({ taskId: 't2', remoteUsage: { inputTokens: 300, outputTokens: 10, reasoningTokens: 0, source: 'provider-usage:openai' } })]
  })
  assert.equal(baseline.metrics.remoteInputTokens, 400)
  assert.equal(baseline.metrics.localInputTokens, null)
  const candidate = buildE2eComparisonReport({
    baselineHead: 'a', candidateHead: 'b', datasetDigest: 'd', hardware: {}, modelEvidence: null, realModelVerified: false,
    receipts: [
      receipt({ arm: 'advisory', localInputTokens: 500, adviceOffered: true, adviceAccepted: true, remoteUsage: { inputTokens: 90, outputTokens: 20, reasoningTokens: 5, source: 'provider-usage:openai' } }),
      receipt({ taskId: 't2', arm: 'advisory', localInputTokens: 500, adviceOffered: false, remoteUsage: { inputTokens: 250, outputTokens: 10, reasoningTokens: 0, source: 'provider-usage:openai' } })
    ]
  })
  assert.equal(candidate.metrics.remoteInputTokens, 340)
  assert.equal(candidate.metrics.localInputTokens, 1000)
  assert.equal(candidate.metrics.adviceAcceptanceRate, 1)
  assert.equal(candidate.metrics.abstentionRate, 0.5)
  assert.equal(remoteTokenSavingsPct(baseline, candidate), 0.15)
  // local tokens never reduce the remote figure
  assert.equal(candidate.metrics.remoteInputTokens + candidate.metrics.localInputTokens!, 1340)

  const noEvidence = buildE2eComparisonReport({
    baselineHead: 'a', candidateHead: 'b', datasetDigest: 'd', hardware: {}, modelEvidence: null, realModelVerified: false,
    receipts: [receipt({ arm: 'advisory', remoteUsage: null })]
  })
  assert.equal(noEvidence.metrics.remoteInputTokens, null)
  assert.ok(noEvidence.unavailableReasons.includes('remote_usage_source_identity_mismatch_or_missing'))
  assert.equal(remoteTokenSavingsPct(baseline, noEvidence), null)
  const mixedSources = buildE2eComparisonReport({
    baselineHead: 'a', candidateHead: 'b', datasetDigest: 'd', hardware: {}, modelEvidence: null, realModelVerified: false,
    receipts: [receipt(), receipt({ taskId: 't2', remoteUsage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 1, source: 'provider-usage:other' } })]
  })
  assert.equal(mixedSources.metrics.remoteInputTokens, null)
  const unlabeled = buildE2eComparisonReport({
    baselineHead: 'a', candidateHead: 'b', datasetDigest: 'd', hardware: {}, modelEvidence: null, realModelVerified: false,
    receipts: [receipt({ success: null })]
  })
  assert.equal(unlabeled.metrics.taskSuccessRate, null)
  assert.ok(unlabeled.unavailableReasons.includes('task_success_labels_incomplete'))
})

test('percentile handles empty and small samples', () => {
  assert.equal(percentile([], 50), null)
  assert.equal(percentile([5], 95), 5)
  assert.equal(percentile([3, 1, 2], 50), 2)
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10)
})

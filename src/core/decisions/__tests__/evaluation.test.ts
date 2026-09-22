import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvaluationReport } from '../evaluation.js';

test('evaluator can report no improvement and insufficient evidence without treating them as software errors', () => {
  const report = buildEvaluationReport({
    rows: [{
      taskId: 't1',
      taskFamily: 'tiny',
      arm: 'deterministic_baseline',
      success: true,
      escapedFailure: false,
      wallClockMs: 100,
      jevOverheadMs: 0,
      cacheHit: false,
      llmRejudgeCalls: 0,
      inputTokens: null,
      outputTokens: null,
      reportedCost: null,
      coveragePreserved: true,
      contextMaterialized: false,
      planCommitted: false,
      recoveryHandlerInvoked: false,
      nativeDispatchObserved: false,
      tokenEvidence: 'unknown'
    }],
    evidenceLevel: 'synthetic',
    live: false
  });
  assert.equal(report.live, false);
  assert.ok(report.unavailableReasons.includes('token_savings_unavailable'));
  assert.ok(report.unavailableReasons.includes('cost_unavailable'));
  assert.equal(report.metrics.llmRejudgeCalls, 0);
  assert.equal(report.metrics.taskSuccessRate, 1);
});

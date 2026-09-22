import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRecoveryEffect, listProductionRecoveryCandidates, RECOVERY_CAPABILITY, setRecoveryTestHandler } from '../recovery.js';
import { compileDecision } from '../policy.js';
import { buildDecisionBundle } from '../questions.js';

test('production recovery remains unsupported and lists no live handlers', () => {
  assert.equal(RECOVERY_CAPABILITY.supported, false);
  assert.deepEqual(listProductionRecoveryCandidates(), []);
});

test('a stub Jev Choice reaches an injected handler without a generative call', async () => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const calls: string[] = [];
  setRecoveryTestHandler('inspect_log', async (input) => {
    calls.push(input.actionId);
    return { invoked: true, actionId: input.actionId, consumptionEvidence: 'handler:inspect_log' };
  });
  const bundle = buildDecisionBundle({
    projectId: 'p',
    workflowRunId: 'w',
    workflowRevision: 'r',
    sourceDigest: 's',
    graphDigest: null,
    goal: 'Recover from an ambiguous test failure',
    recoveryCandidates: [
      { id: 'inspect_log', summary: 'Re-read the existing test log.', handlerId: 'inspect_log', authorized: true, readOnly: true },
      { id: 'rerun_check', summary: 'Rerun the already authorized read-only check.', handlerId: 'rerun_check', authorized: true, readOnly: true }
    ],
    recoveryDiagnostic: 'two tests failed with an ambiguous assertion'
  });
  const compiled = compileDecision(bundle, {
    model: 'typesafe/jev-1.13',
    answers: {
      recovery: {
        type: 'choice',
        choice: 'inspect_log',
        confidence: 0.9,
        probabilities: {
          inspect_log: 0.9,
          rerun_check: 0.05,
          keep_baseline: 0.03,
          needs_evidence: 0.02
        }
      }
    },
    usage: { input_tokens: 10, output_tokens: 0 }
  });
  assert.equal(compiled.kind, 'apply');
  if (compiled.kind !== 'apply') return;
  assert.equal(compiled.effects[0]?.kind, 'dispatch_recovery');
  const applied = await applyRecoveryEffect({
    actionId: 'inspect_log',
    diagnostic: 'two tests failed',
    candidates: bundle.recoveryCandidates
  });
  assert.equal(applied.ok, true);
  assert.deepEqual(calls, ['inspect_log']);
  setRecoveryTestHandler('inspect_log', null);
});

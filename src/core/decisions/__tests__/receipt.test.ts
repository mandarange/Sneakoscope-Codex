import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionReceipt, unknownUsageReceipt } from '../receipt.js';
import { planningBundle } from './fixtures.js';

test('receipts keep unknown usage as null and do not repeat cache cost', () => {
  const bundle = planningBundle();
  const compiled = {
    kind: 'keep_baseline' as const,
    binding: bundle.binding,
    reason: 'off' as const,
    usage: { inputTokens: 12, outputTokens: 0, reportedCost: 0.01, evidence: 'provider_response' as const }
  };
  const cached = buildDecisionReceipt({
    binding: bundle.binding,
    compiled,
    result: 'kept_baseline',
    reason: 'off',
    elapsedMs: 10,
    cacheHit: true
  });
  assert.equal(cached.usage.reportedCost, null);
  assert.equal(cached.cacheHit, true);
  const unknown = unknownUsageReceipt();
  assert.equal(unknown.inputTokens, null);
  assert.equal(unknown.evidence, 'unknown');
  const secret = buildDecisionReceipt({
    binding: bundle.binding,
    compiled,
    result: 'kept_baseline',
    reason: 'sk-or-v1-should-not-leak-aaaaaaaa',
    elapsedMs: 1,
    env: { OPENROUTER_API_KEY: 'sk-or-v1-should-not-leak-aaaaaaaa' }
  });
  assert.doesNotMatch(JSON.stringify(secret), /sk-or-v1-should-not-leak-aaaaaaaa/);
});

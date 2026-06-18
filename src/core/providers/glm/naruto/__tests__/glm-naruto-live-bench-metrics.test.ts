import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGlmNarutoWorkerMetrics } from '../glm-naruto-metrics.js';
import type { GlmNarutoWorkerTrace } from '../glm-naruto-types.js';

function trace(partial: Partial<GlmNarutoWorkerTrace>): GlmNarutoWorkerTrace {
  return {
    worker_id: 'w',
    shard_id: 's',
    strategy: 'minimal_patch',
    model: 'z-ai/glm-5.2',
    provider: 'openrouter',
    session_id: 'session',
    ttft_ms: null,
    total_ms: 0,
    request_cache_hit: false,
    output_digest: 'out',
    patch_digest: null,
    status: 'completed',
    ...partial
  };
}

test('summarizes TTFT, totals, cache tokens, and verifier pass rate from traces', () => {
  const metrics = summarizeGlmNarutoWorkerMetrics([
    trace({ worker_id: 'w1', ttft_ms: 100, total_ms: 500, cached_tokens: 1000, cache_write_tokens: 50, reasoning_tokens: 3 }),
    trace({ worker_id: 'w2', ttft_ms: 300, total_ms: 900, status: 'failed' }),
    trace({ worker_id: 'v1', ttft_ms: 200, total_ms: 700, status: 'verification_passed' }),
    trace({ worker_id: 'v2', ttft_ms: 400, total_ms: 1000, status: 'verification_failed' })
  ]);
  assert.equal(metrics.p50_ttft_ms, 200);
  assert.equal(metrics.p90_ttft_ms, 400);
  assert.equal(metrics.p50_total_ms, 700);
  assert.equal(metrics.verifier_pass_rate, 0.5);
  assert.equal(metrics.cached_tokens_sum, 1000);
  assert.equal(metrics.cache_write_tokens_sum, 50);
  assert.equal(metrics.reasoning_tokens_sum, 3);
  assert.equal(metrics.workers_failed, 1);
});

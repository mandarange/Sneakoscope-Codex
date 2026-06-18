import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderHealthTracker } from '../../../openrouter/openrouter-provider-health.js';
import { runGlmNarutoWorkerScheduler } from '../glm-naruto-worker-scheduler.js';
import type { GlmNarutoShard, GlmNarutoWorkerTrace } from '../glm-naruto-types.js';
import type { WorkerRunResult } from '../glm-naruto-worker-runtime.js';

const shard: GlmNarutoShard = {
  id: 's1',
  kind: 'file_patch',
  task: 'test',
  target_paths: ['src/a.ts'],
  forbidden_paths: [],
  base_digest: 'base',
  strategy: 'minimal_patch',
  patches_per_shard: 1,
  max_tokens: 128,
  reasoning: 'low',
  mutable: true
};

function failedNonRetryable(): WorkerRunResult {
  const trace: GlmNarutoWorkerTrace = {
    worker_id: 'w1',
    shard_id: 's1',
    strategy: 'minimal_patch',
    model: 'z-ai/glm-5.2',
    provider: 'openrouter',
    provider_slug: 'openrouter',
    session_id: 'session',
    ttft_ms: null,
    total_ms: 20,
    request_cache_hit: false,
    output_digest: 'out',
    patch_digest: null,
    status: 'blocked'
  };
  return { ok: false, envelope: null, trace, error: 'model_guard:glm_model_mismatch', issue: { code: 'model_guard:glm_model_mismatch', retryable: false } };
}

test('non-retryable worker issues are not retried', async () => {
  let calls = 0;
  const result = await runGlmNarutoWorkerScheduler({
    jobs: [{ worker_id: 'w1', shard, strategy: 'minimal_patch' }],
    initial_active_workers: 1,
    max_active_workers: 1,
    worker_timeout_ms: 1000,
    health: createProviderHealthTracker(),
    onDecision: () => undefined,
    runJob: async () => {
      calls++;
      return failedNonRetryable();
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.retry_events.length, 0);
  assert.equal(result.results.length, 1);
});

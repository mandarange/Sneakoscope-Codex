import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderHealthTracker } from '../../../openrouter/openrouter-provider-health.js';
import { runGlmNarutoWorkerScheduler, type GlmNarutoWorkerJob } from '../glm-naruto-worker-scheduler.js';
import type { GlmNarutoShard, GlmNarutoWorkerTrace } from '../glm-naruto-types.js';
import type { WorkerRunResult } from '../glm-naruto-worker-runtime.js';

function shard(id: string): GlmNarutoShard {
  return {
    id,
    kind: 'file_patch',
    task: 'test',
    target_paths: [`src/${id}.ts`],
    forbidden_paths: [],
    base_digest: 'base',
    strategy: 'minimal_patch',
    patches_per_shard: 1,
    max_tokens: 128,
    reasoning: 'low',
    mutable: true
  };
}

function jobs(count: number): GlmNarutoWorkerJob[] {
  return Array.from({ length: count }, (_, index) => ({ worker_id: `w${index}`, shard: shard(`s${index}`), strategy: 'minimal_patch' }));
}

function result(job: GlmNarutoWorkerJob, ok = true, issue?: WorkerRunResult['issue']): WorkerRunResult {
  const trace: GlmNarutoWorkerTrace = {
    worker_id: job.worker_id,
    shard_id: job.shard.id,
    strategy: job.strategy,
    model: 'z-ai/glm-5.2',
    provider: 'openrouter',
    provider_slug: 'openrouter',
    session_id: `session-${job.worker_id}`,
    ttft_ms: ok ? 10 : null,
    total_ms: 20,
    request_cache_hit: false,
    output_digest: 'out',
    patch_digest: null,
    status: ok ? 'completed' : 'failed'
  };
  return { ok, envelope: null, trace, ...(issue ? { issue, error: issue.code } : {}) };
}

test('scheduler never exceeds operator max while queue drains', async () => {
  let active = 0;
  let maxActive = 0;
  const scheduler = await runGlmNarutoWorkerScheduler({
    jobs: jobs(6),
    initial_active_workers: 3,
    max_active_workers: 3,
    worker_timeout_ms: 1000,
    health: createProviderHealthTracker(),
    onDecision: () => undefined,
    runJob: async (job) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return result(job);
    }
  });
  assert.equal(scheduler.results.length, 6);
  assert.ok(maxActive <= 3);
  assert.ok(scheduler.max_observed_active_workers <= 3);
});

test('scheduler retries retryable 429 once and records backpressure', async () => {
  let calls = 0;
  const scheduler = await runGlmNarutoWorkerScheduler({
    jobs: jobs(1),
    initial_active_workers: 1,
    max_active_workers: 1,
    worker_timeout_ms: 1000,
    health: createProviderHealthTracker(),
    onDecision: () => undefined,
    runJob: async (job) => {
      calls++;
      if (calls === 1) return result(job, false, { code: 'glm_openrouter_rate_limited', retryable: true, provider_status: 429, retry_after_ms: 1 });
      return result(job);
    }
  });
  assert.equal(calls, 2);
  assert.equal(scheduler.retry_events.length, 1);
  assert.ok(scheduler.backpressure_events >= 1);
  assert.equal(scheduler.results.length, 1);
  assert.equal(scheduler.results[0]?.status, 'fulfilled');
});

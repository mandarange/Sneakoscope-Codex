import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runGlmBenchmark } from '../glm-benchmark-runner.js';
import type { GlmDirectRunResult } from '../../glm-direct-run.js';
import type { GlmNarutoMissionResult } from '../../naruto/glm-naruto-types.js';

function mockDirect(task: string): GlmDirectRunResult {
  return {
    schema: 'sks.glm-direct-run-result.v1', ok: true, status: 'completed', run_id: 'd',
    task, model: 'z-ai/glm-5.2', gpt_fallback_allowed: false,
    termination_reason: 'completed_noop', touched_paths: [], blockers: [], warnings: []
  };
}

function mockNaruto(task: string, workers: number): GlmNarutoMissionResult {
  return {
    schema: 'sks.glm-naruto-mission-result.v1', ok: false, status: 'partial_candidates',
    mission_id: `M-${workers}`, task, model: 'z-ai/glm-5.2', gpt_fallback_allowed: false,
    termination_reason: 'partial_no_apply', workers_started: workers, workers_completed: 0,
    patch_candidates: 0, gate_passed_candidates: 0, mergeable_candidates: 0,
    applied_patches: 0, failed_shards: 0, repair_waves: 0, budget_used_ms: 0,
    blockers: [], warnings: []
  };
}

test('benchmark result schema is v1 with the current GLM benchmark contract version', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-schema-'));
  const result = await runGlmBenchmark(root, []);
  assert.equal(result.schema, 'sks.glm-benchmark-result.v1');
  assert.equal(result.version, '4.2.0');
  assert.equal(result.model, 'z-ai/glm-5.2');
  assert.equal(result.gpt_fallback_allowed, false);
});

test('live benchmark cases use correct schema and metric_status', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  try {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-schema-live-'));
    const result = await runGlmBenchmark(root, ['--live'], {
      runDirect: async (input) => mockDirect(input.task),
      runNaruto: async (input) => mockNaruto(input.task, input.maxWorkers ?? 0)
    });
    assert.equal(result.status, 'live');
    assert.equal(result.cases.length, 5);
    for (const c of result.cases) {
      assert.equal(c.schema, 'sks.glm-benchmark-case.v1');
      assert.equal(c.model, 'z-ai/glm-5.2');
      assert.equal(c.gpt_fallback_allowed, false);
      assert.equal(c.no_apply, true);
      assert.equal(c.mutation_performed, false);
    }
    const direct = result.cases.find((c) => c.runner_id === 'direct-glm-speed');
    assert.equal(direct?.metric_status.candidate, 'not_applicable');
    assert.equal(direct?.metric_status.verifier, 'not_applicable');
    assert.equal(direct?.metric_status.merge, 'not_applicable');
    assert.equal(direct?.candidate_count, null);
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});

test('missing metrics are null not zero', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  try {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-schema-null-'));
    const result = await runGlmBenchmark(root, ['--live'], {
      runDirect: async (input) => mockDirect(input.task),
      runNaruto: async (input) => mockNaruto(input.task, input.maxWorkers ?? 0)
    });
    const naruto1 = result.cases.find((c) => c.runner_id === 'glm-naruto-1');
    assert.ok(naruto1);
    assert.equal(naruto1.p50_ttft_ms, null);
    assert.equal(naruto1.cached_tokens_sum, null);
    assert.equal(naruto1.gate_pass_rate, null);
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});

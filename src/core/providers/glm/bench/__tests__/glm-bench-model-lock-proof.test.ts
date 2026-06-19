import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runGlmBenchmark } from '../glm-benchmark-runner.js';
import { buildGlmBenchModelLockProof } from '../glm-bench-model-lock-proof.js';
import type { GlmBenchmarkCaseResult } from '../glm-benchmark-types.js';

test('model-lock-proof.json is written for live benchmark', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  try {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-model-lock-'));
    const result = await runGlmBenchmark(root, ['--live'], {
      runDirect: async (input) => ({
        schema: 'sks.glm-direct-run-result.v1', ok: true, status: 'completed', run_id: 'd',
        task: input.task, model: 'z-ai/glm-5.2', gpt_fallback_allowed: false,
        termination_reason: 'completed_noop', touched_paths: [], blockers: [], warnings: []
      }),
      runNaruto: async (input) => ({
        schema: 'sks.glm-naruto-mission-result.v1', ok: false, status: 'partial_candidates',
        mission_id: input.missionId ?? 'M', task: input.task, model: 'z-ai/glm-5.2',
        gpt_fallback_allowed: false, termination_reason: 'partial_no_apply',
        workers_started: input.maxWorkers ?? 0, workers_completed: 0,
        patch_candidates: 0, gate_passed_candidates: 0, mergeable_candidates: 0,
        applied_patches: 0, failed_shards: 0, repair_waves: 0, budget_used_ms: 0,
        blockers: [], warnings: []
      })
    });

    assert.ok(result.model_lock_proof);
    assert.equal(result.model_lock_proof.schema, 'sks.glm-bench-model-lock-proof.v1');
    assert.equal(result.model_lock_proof.model, 'z-ai/glm-5.2');
    assert.equal(result.model_lock_proof.gpt_fallback_allowed, false);
    assert.equal(result.model_lock_proof.fallback_arrays_found, 0);
    assert.equal(result.model_lock_proof.openai_key_used, false);
    assert.equal(result.model_lock_proof.request_summary_status, 'unavailable');
    assert.equal(result.model_lock_proof.mismatches.length, 0);
    assert.equal(result.model_lock_proof.passed, true);
    assert.equal(result.model_lock_proof.checked_cases.length, 5);
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});

test('buildGlmBenchModelLockProof detects model mismatch', () => {
  const cases: GlmBenchmarkCaseResult[] = [
    {
      schema: 'sks.glm-benchmark-case.v1',
      name: 'bad', kind: 'direct-glm', runner_id: 'direct-glm-speed',
      implementation_path: 'direct-glm', workers: 1,
      model: 'gpt-4o' as any, gpt_fallback_allowed: true as any,
      no_apply: true, mutation_performed: false, wall_clock_ms: 100,
      p50_ttft_ms: null, p90_ttft_ms: null, p50_total_ms: null, p90_total_ms: null,
      candidate_count: null, gate_pass_rate: null, verifier_pass_rate: null,
      merge_success: null, patch_generated: null, patch_gate_passed: null,
      cached_tokens_sum: null, cache_write_tokens_sum: null, reasoning_tokens_sum: null,
      metric_status: { latency: 'unavailable', usage: 'unavailable', candidate: 'not_applicable', verifier: 'not_applicable', merge: 'not_applicable' },
      artifacts: { case_dir: '/tmp', trace_path: null, mission_artifact_dir: null },
      blockers: [], warnings: []
    }
  ];
  const proof = buildGlmBenchModelLockProof(cases);
  assert.equal(proof.passed, false);
  assert.ok(proof.mismatches.length >= 1);
});

test('buildGlmBenchModelLockProof marks request summaries checked when provided', () => {
  const cases: GlmBenchmarkCaseResult[] = [
    {
      schema: 'sks.glm-benchmark-case.v1',
      name: 'good', kind: 'glm-naruto', runner_id: 'glm-naruto-1',
      implementation_path: 'glm-naruto', workers: 1,
      model: 'z-ai/glm-5.2', gpt_fallback_allowed: false,
      no_apply: true, mutation_performed: false, wall_clock_ms: 100,
      p50_ttft_ms: null, p90_ttft_ms: null, p50_total_ms: null, p90_total_ms: null,
      candidate_count: null, gate_pass_rate: null, verifier_pass_rate: null,
      merge_success: null, patch_generated: null, patch_gate_passed: null,
      cached_tokens_sum: null, cache_write_tokens_sum: null, reasoning_tokens_sum: null,
      metric_status: { latency: 'unavailable', usage: 'unavailable', candidate: 'measured', verifier: 'measured', merge: 'measured' },
      artifacts: { case_dir: '/tmp', trace_path: null, mission_artifact_dir: null },
      blockers: [], warnings: []
    }
  ];
  const proof = buildGlmBenchModelLockProof(cases, {
    requestSummaries: [{ worker_id: 'worker-1', model: 'z-ai/glm-5.2', gpt_fallback_allowed: false, fallback_models_count: 0, openai_key_used: false }]
  });
  assert.equal(proof.request_summary_status, 'checked');
  assert.equal(proof.request_summaries_checked, 1);
  assert.equal(proof.passed, true);
});

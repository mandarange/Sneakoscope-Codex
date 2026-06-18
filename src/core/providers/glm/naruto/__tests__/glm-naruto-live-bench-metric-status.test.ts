import test from 'node:test';
import assert from 'node:assert/strict';
import { runGlmNarutoBench } from '../glm-naruto-bench.js';
import type { GlmDirectRunResult } from '../../glm-direct-run.js';
import type { GlmNarutoMissionResult } from '../glm-naruto-types.js';

function mockDirect(input: { task: string }): GlmDirectRunResult {
  return {
    schema: 'sks.glm-direct-run-result.v1',
    ok: true,
    status: 'completed',
    run_id: 'direct',
    task: input.task,
    model: 'z-ai/glm-5.2',
    gpt_fallback_allowed: false,
    termination_reason: 'completed_noop',
    touched_paths: [],
    blockers: [],
    warnings: []
  };
}

function mockNaruto(input: { maxWorkers?: number; missionId?: string; task: string }): GlmNarutoMissionResult {
  return {
    schema: 'sks.glm-naruto-mission-result.v1',
    ok: false,
    status: 'partial_candidates',
    mission_id: input.missionId ?? 'M-test',
    task: input.task,
    model: 'z-ai/glm-5.2',
    gpt_fallback_allowed: false,
    termination_reason: 'partial_no_apply',
    workers_started: input.maxWorkers ?? 0,
    workers_completed: 0,
    patch_candidates: 0,
    gate_passed_candidates: 0,
    mergeable_candidates: 0,
    applied_patches: 0,
    failed_shards: 0,
    repair_waves: 0,
    budget_used_ms: 0,
    blockers: [],
    warnings: []
  };
}

test('live bench marks unavailable metrics as null with status, not fake zero', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  try {
    const result = await runGlmNarutoBench('/tmp', ['--live'], {
      runDirect: async (input: { task: string }) => mockDirect(input),
      runNaruto: async (input: { maxWorkers?: number; missionId?: string; task: string }) => mockNaruto(input)
    });
    const narutoOne = result.cases.find((c) => c.runner_id === 'glm-naruto-1');
    assert.ok(narutoOne, 'glm-naruto-1 case must exist');
    assert.equal(narutoOne.p50_ttft_ms, null);
    assert.equal(narutoOne.gate_pass_rate, null);
    assert.equal(narutoOne.metric_status.latency, 'unavailable');
    assert.equal(narutoOne.metric_status.candidate, 'measured');
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

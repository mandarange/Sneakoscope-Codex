import test from 'node:test';
import assert from 'node:assert/strict';
import { runGlmNarutoBench } from '../glm-naruto-bench.js';
import type { GlmDirectRunResult } from '../../glm-direct-run.js';
import type { GlmNarutoMissionResult } from '../glm-naruto-types.js';

test('live bench marks unavailable metrics as null with status, not fake zero', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  try {
    const direct: GlmDirectRunResult = {
      schema: 'sks.glm-direct-run-result.v1',
      ok: true,
      status: 'completed',
      run_id: 'direct',
      task: 'task',
      model: 'z-ai/glm-5.2',
      gpt_fallback_allowed: false,
      termination_reason: 'completed_noop',
      touched_paths: [],
      blockers: [],
      warnings: []
    };
    const naruto: GlmNarutoMissionResult = {
      schema: 'sks.glm-naruto-mission-result.v1',
      ok: false,
      status: 'partial_candidates',
      mission_id: 'M-test',
      task: 'task',
      model: 'z-ai/glm-5.2',
      gpt_fallback_allowed: false,
      termination_reason: 'partial_no_apply',
      workers_started: 0,
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
    const result = await runGlmNarutoBench('/tmp', ['--live'], {
      runDirect: async () => direct,
      runNaruto: async () => naruto
    });
    const narutoOne = result.cases?.find((row) => row.name === 'GLM Naruto 1 worker');
    assert.equal(narutoOne?.p50_ttft_ms, null);
    assert.equal(narutoOne?.gate_pass_rate, null);
    assert.equal(narutoOne?.metric_status, 'unavailable');
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

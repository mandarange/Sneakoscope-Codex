import test from 'node:test';
import assert from 'node:assert/strict';
import { runGlmNarutoBench } from '../glm-naruto-bench.js';
import type { GlmDirectRunResult } from '../../glm-direct-run.js';
import type { GlmNarutoMissionResult } from '../glm-naruto-types.js';

test('live bench separates true direct GLM from Naruto worker cases', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  const narutoWorkers: number[] = [];
  let directCalls = 0;
  try {
    const result = await runGlmNarutoBench('/tmp', ['--live'], {
      runDirect: async (input): Promise<GlmDirectRunResult> => {
        directCalls++;
        assert.equal(input.dryRun, true);
        return {
          schema: 'sks.glm-direct-run-result.v1',
          ok: true,
          status: 'completed',
          run_id: 'direct',
          task: input.task,
          model: 'z-ai/glm-5.2',
          gpt_fallback_allowed: false,
          termination_reason: 'completed_noop',
          touched_paths: ['src/bench-target.ts'],
          blockers: [],
          warnings: []
        };
      },
      runNaruto: async (input): Promise<GlmNarutoMissionResult> => {
        narutoWorkers.push(input.maxWorkers ?? 0);
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
    });
    assert.equal(directCalls, 1);
    assert.deepEqual(narutoWorkers, [1, 4, 8, 12]);
    assert.equal(result.cases[0]?.kind, 'direct-glm');
    assert.equal(result.cases[0]?.implementation_path, 'direct-glm');
    assert.equal(result.cases[0]?.runner_id, 'direct-glm-speed');
    assert.equal(result.cases[1]?.runner_id, 'glm-naruto-1');
    assert.equal(result.cases[1]?.implementation_path, 'glm-naruto');
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

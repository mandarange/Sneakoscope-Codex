import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runGlmBenchmark } from '../glm-benchmark-runner.js';
import type { GlmDirectRunResult } from '../../glm-direct-run.js';
import type { GlmNarutoMissionResult } from '../../naruto/glm-naruto-types.js';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test('direct-glm-speed case does not call runGlmNarutoMission', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  try {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-true-direct-'));
    const result = await runGlmBenchmark(root, ['--live'], {
      runDirect: async (input): Promise<GlmDirectRunResult> => {
        await delay(5);
        return {
          schema: 'sks.glm-direct-run-result.v1', ok: true, status: 'completed', run_id: 'd',
          task: input.task, model: 'z-ai/glm-5.2', gpt_fallback_allowed: false,
          termination_reason: 'completed_noop', touched_paths: [], blockers: [], warnings: []
        };
      },
      runNaruto: async (input): Promise<GlmNarutoMissionResult> => {
        await delay(5);
        return {
          schema: 'sks.glm-naruto-mission-result.v1', ok: false, status: 'partial_candidates',
          mission_id: input.missionId ?? 'M', task: input.task, model: 'z-ai/glm-5.2',
          gpt_fallback_allowed: false, termination_reason: 'partial_no_apply',
          workers_started: input.maxWorkers ?? 0, workers_completed: 0,
          patch_candidates: 0, gate_passed_candidates: 0, mergeable_candidates: 0,
          applied_patches: 0, failed_shards: 0, repair_waves: 0, budget_used_ms: 0,
          blockers: [], warnings: []
        };
      }
    });

    assert.equal(result.cases.length, 5);
    assert.equal(result.cases[0]!.runner_id, 'direct-glm-speed');
    assert.equal(result.cases[0]!.implementation_path, 'direct-glm');
    assert.equal(result.cases[1]!.runner_id, 'glm-naruto-1');
    assert.equal(result.cases[1]!.implementation_path, 'glm-naruto');
    assert.equal(result.cases[2]!.runner_id, 'glm-naruto-4');
    assert.equal(result.cases[3]!.runner_id, 'glm-naruto-8');
    assert.equal(result.cases[4]!.runner_id, 'glm-naruto-12');

    const directTraceDir = result.cases[0]!.artifacts.case_dir;
    const trace = JSON.parse(await fs.readFile(path.join(directTraceDir, 'trace.json'), 'utf8'));
    assert.equal(trace.called_naruto, false);
    assert.equal(trace.implementation_path, 'direct-glm');
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});

test('comparison computes speedup only when both direct and Naruto have measured wall time', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  try {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-comparison-'));
    const result = await runGlmBenchmark(root, ['--live'], {
      runDirect: async (input) => {
        await delay(10);
        return {
          schema: 'sks.glm-direct-run-result.v1', ok: true, status: 'completed', run_id: 'd',
          task: input.task, model: 'z-ai/glm-5.2', gpt_fallback_allowed: false,
          termination_reason: 'completed_noop', touched_paths: [], blockers: [], warnings: []
        };
      },
      runNaruto: async (input) => {
        await delay(5);
        return {
          schema: 'sks.glm-naruto-mission-result.v1', ok: true, status: 'completed',
          mission_id: input.missionId ?? 'M', task: input.task, model: 'z-ai/glm-5.2',
          gpt_fallback_allowed: false, termination_reason: 'completed',
          workers_started: input.maxWorkers ?? 0, workers_completed: input.maxWorkers ?? 0,
          patch_candidates: 4, gate_passed_candidates: 3, mergeable_candidates: 2,
          applied_patches: 0, failed_shards: 0, repair_waves: 0, budget_used_ms: 0,
          blockers: [], warnings: []
        };
      }
    });
    assert.notEqual(result.comparison.direct_wall_clock_ms, null);
    assert.ok(result.comparison.direct_wall_clock_ms! > 0);
    assert.notEqual(result.comparison.best_naruto_wall_clock_ms, null);
    assert.ok(result.comparison.best_naruto_wall_clock_ms! > 0);
    assert.notEqual(result.comparison.naruto_speedup_vs_direct, null);
    assert.ok(['direct-glm', 'glm-naruto', 'inconclusive'].includes(result.comparison.recommendation));
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});

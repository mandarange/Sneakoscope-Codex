import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmNarutoCriticalPathMetrics } from '../glm-naruto-critical-path.js';

test('critical path reports slowest stage from stage wall clocks', () => {
  const metrics = buildGlmNarutoCriticalPathMetrics({
    totalWallClockMs: 200,
    stages: [
      { stage: 'patch_generation', job_count: 4, max_observed_active: 4, wall_clock_ms: 80, sum_job_duration_ms: 240, overlap_ratio: 3 },
      { stage: 'candidate_gate', job_count: 4, max_observed_active: 2, wall_clock_ms: 40, sum_job_duration_ms: 70, overlap_ratio: 1.75 }
    ],
    decompositionMs: 5,
    conflictMergeMs: 12,
    finalApplyMs: null,
    finalSealMs: 6,
    parallelismWarnings: []
  });
  assert.equal(metrics.slowest_stage, 'patch_generation');
});

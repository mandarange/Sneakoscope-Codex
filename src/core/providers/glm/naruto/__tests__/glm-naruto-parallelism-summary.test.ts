import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmNarutoParallelismSummary } from '../glm-naruto-parallelism-summary.js';

test('parallelism summary warns when multi-job overlap is ineffective', () => {
  const summary = buildGlmNarutoParallelismSummary({
    totalWallClockMs: 100,
    metrics: [{
      stage: 'candidate_gate',
      job_count: 3,
      max_observed_active: 1,
      wall_clock_ms: 90,
      sum_job_duration_ms: 92,
      overlap_ratio: 92 / 90
    }]
  });
  assert.equal(summary.parallelism_effective, false);
  assert.deepEqual(summary.blockers, ['glm_parallelism_not_effective:candidate_gate']);
});

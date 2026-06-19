import test from 'node:test';
import assert from 'node:assert/strict';
import { runGlmNarutoStageScheduler } from '../glm-naruto-stage-scheduler.js';

test('stage scheduler never exceeds max_active and records events', async () => {
  let active = 0;
  let maxActive = 0;
  const result = await runGlmNarutoStageScheduler({
    stage: 'candidate_gate',
    jobs: Array.from({ length: 5 }, (_, index) => ({ id: `j${index}`, stage: 'candidate_gate' as const, input: index })),
    max_active: 2,
    timeout_ms: 1000,
    runJob: async (job) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return job.input;
    }
  });
  assert.equal(result.results.length, 5);
  assert.ok(maxActive <= 2);
  assert.ok(result.max_observed_active <= 2);
  assert.equal(result.events.filter((event) => event.phase === 'start').length, 5);
  assert.equal(result.events.filter((event) => event.phase === 'end').length, 5);
});

test('stage scheduler records overlap for delayed parallel jobs', async () => {
  const result = await runGlmNarutoStageScheduler({
    stage: 'verifier',
    jobs: Array.from({ length: 4 }, (_, index) => ({ id: `v${index}`, stage: 'verifier' as const, input: index })),
    max_active: 4,
    timeout_ms: 1000,
    runJob: async (job) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return job.input;
    }
  });
  assert.ok(result.overlap_ratio > 1.5);
});

test('stage scheduler timeout rejects one job without killing all jobs', async () => {
  const result = await runGlmNarutoStageScheduler({
    stage: 'candidate_gate',
    jobs: [
      { id: 'fast', stage: 'candidate_gate' as const, input: 'fast' },
      { id: 'slow', stage: 'candidate_gate' as const, input: 'slow' }
    ],
    max_active: 2,
    timeout_ms: 20,
    runJob: async (job) => {
      if (job.id === 'slow') await new Promise((resolve) => setTimeout(resolve, 80));
      return job.input;
    }
  });
  assert.equal(result.results.length, 2);
  assert.equal(result.results.filter((row) => row.status === 'fulfilled').length, 1);
  assert.equal(result.results.filter((row) => row.status === 'rejected').length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGlmBenchmarkComparison } from '../glm-bench-comparison.js';
import type { GlmBenchmarkCaseResult } from '../glm-benchmark-types.js';

function makeCase(
  runnerId: GlmBenchmarkCaseResult['runner_id'],
  impl: 'direct-glm' | 'glm-naruto',
  workers: number,
  wallMs: number,
  opts?: Partial<GlmBenchmarkCaseResult>
): GlmBenchmarkCaseResult {
  return {
    schema: 'sks.glm-benchmark-case.v1',
    name: runnerId,
    kind: impl === 'direct-glm' ? 'direct-glm' : 'glm-naruto',
    runner_id: runnerId,
    implementation_path: impl,
    workers,
    model: 'z-ai/glm-5.2',
    gpt_fallback_allowed: false,
    no_apply: true,
    mutation_performed: false,
    wall_clock_ms: wallMs,
    p50_ttft_ms: null,
    p90_ttft_ms: null,
    p50_total_ms: null,
    p90_total_ms: null,
    candidate_count: impl === 'direct-glm' ? null : 4,
    gate_pass_rate: impl === 'direct-glm' ? null : 0.75,
    verifier_pass_rate: impl === 'direct-glm' ? null : 0.5,
    merge_success: impl === 'direct-glm' ? null : true,
    patch_generated: impl === 'direct-glm' ? true : true,
    patch_gate_passed: impl === 'direct-glm' ? true : true,
    cached_tokens_sum: null,
    cache_write_tokens_sum: null,
    reasoning_tokens_sum: null,
    metric_status: {
      latency: 'measured',
      usage: 'unavailable',
      candidate: impl === 'direct-glm' ? 'not_applicable' : 'measured',
      verifier: impl === 'direct-glm' ? 'not_applicable' : 'measured',
      merge: impl === 'direct-glm' ? 'not_applicable' : 'measured'
    },
    artifacts: { case_dir: '/tmp', trace_path: null, mission_artifact_dir: null },
    blockers: [],
    warnings: [],
    ...opts
  };
}

test('recommends direct-glm when Naruto is slower by less than 1.2x', () => {
  const cases = [
    makeCase('direct-glm-speed', 'direct-glm', 1, 1000),
    makeCase('glm-naruto-4', 'glm-naruto', 4, 950)
  ];
  const comp = computeGlmBenchmarkComparison(cases);
  assert.equal(comp.recommendation, 'direct-glm');
  assert.equal(comp.direct_wall_clock_ms, 1000);
  assert.equal(comp.best_naruto_wall_clock_ms, 950);
});

test('recommends glm-naruto when speedup >= 1.2', () => {
  const cases = [
    makeCase('direct-glm-speed', 'direct-glm', 1, 2000),
    makeCase('glm-naruto-8', 'glm-naruto', 8, 1000)
  ];
  const comp = computeGlmBenchmarkComparison(cases);
  assert.equal(comp.recommendation, 'glm-naruto');
  assert.equal(comp.naruto_speedup_vs_direct, 2);
});

test('inconclusive when direct fails and Naruto has no gate-passed', () => {
  const cases = [
    makeCase('direct-glm-speed', 'direct-glm', 1, 1000, { patch_generated: false, patch_gate_passed: false }),
    makeCase('glm-naruto-1', 'glm-naruto', 1, 800, { gate_pass_rate: null, merge_success: null, patch_generated: false, patch_gate_passed: false })
  ];
  const comp = computeGlmBenchmarkComparison(cases);
  assert.equal(comp.recommendation, 'inconclusive');
  assert.equal(comp.direct_wall_clock_ms, null);
  assert.equal(comp.best_naruto_wall_clock_ms, null);
});

test('recommends direct-glm when direct succeeds and all Naruto fail', () => {
  const cases = [
    makeCase('direct-glm-speed', 'direct-glm', 1, 500),
    makeCase('glm-naruto-1', 'glm-naruto', 1, 300, { gate_pass_rate: null, merge_success: null, patch_generated: false, patch_gate_passed: false })
  ];
  const comp = computeGlmBenchmarkComparison(cases);
  assert.equal(comp.recommendation, 'direct-glm');
  assert.equal(comp.best_naruto_wall_clock_ms, null);
});

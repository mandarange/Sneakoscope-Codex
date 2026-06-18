import type { GlmBenchmarkCaseResult, GlmBenchmarkComparison } from './glm-benchmark-types.js';

export function computeGlmBenchmarkComparison(cases: readonly GlmBenchmarkCaseResult[]): GlmBenchmarkComparison {
  const directCase = cases.find((c) => c.implementation_path === 'direct-glm');
  const narutoCases = cases.filter((c) => c.implementation_path === 'glm-naruto');

  const directSucceeded = Boolean(directCase && (directCase.patch_generated === true || directCase.patch_gate_passed === true));
  const directWallClockMs = directCase && directSucceeded ? directCase.wall_clock_ms : null;

  const eligibleNaruto = narutoCases.filter(
    (c) => (c.gate_pass_rate !== null && c.gate_pass_rate > 0) || c.merge_success === true
  );

  let bestNaruto: GlmBenchmarkCaseResult | null = null;
  for (const naruto of eligibleNaruto) {
    if (!bestNaruto || naruto.wall_clock_ms < bestNaruto.wall_clock_ms) {
      bestNaruto = naruto;
    }
  }

  const bestNarutoWallClockMs = bestNaruto ? bestNaruto.wall_clock_ms : null;
  const bestNarutoRunnerId = bestNaruto ? bestNaruto.runner_id : null;

  let speedup: number | null = null;
  if (directWallClockMs !== null && bestNarutoWallClockMs !== null && bestNarutoWallClockMs > 0) {
    speedup = Number((directWallClockMs / bestNarutoWallClockMs).toFixed(3));
  }

  let recommendation: GlmBenchmarkComparison['recommendation'] = 'inconclusive';
  let reason = 'Insufficient measured data to recommend a path.';

  if (directWallClockMs !== null && bestNarutoWallClockMs === null) {
    recommendation = 'direct-glm';
    reason = 'Direct GLM succeeded and no Naruto case produced gate-passed or merged results.';
  } else if (directWallClockMs !== null && bestNarutoWallClockMs !== null && speedup !== null) {
    if (speedup >= 1.2) {
      recommendation = 'glm-naruto';
      reason = `GLM Naruto (${bestNarutoRunnerId}) was ${speedup.toFixed(2)}x faster than direct GLM for this task.`;
    } else {
      recommendation = 'direct-glm';
      reason = `Direct GLM was faster for this tiny single-file task (speedup ratio ${speedup.toFixed(2)}).`;
    }
  } else if (directWallClockMs === null && bestNarutoWallClockMs !== null) {
    recommendation = 'glm-naruto';
    reason = `GLM Naruto (${bestNarutoRunnerId}) produced results while direct GLM did not complete.`;
  }

  return {
    direct_wall_clock_ms: directWallClockMs,
    best_naruto_wall_clock_ms: bestNarutoWallClockMs,
    best_naruto_runner_id: bestNarutoRunnerId,
    naruto_speedup_vs_direct: speedup,
    recommendation,
    reason
  };
}

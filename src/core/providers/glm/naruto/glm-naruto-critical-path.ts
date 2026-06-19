import path from 'node:path';
import { writeJsonAtomic, writeTextAtomic } from '../../../fsx.js';
import type { GlmNarutoStageParallelismMetric } from './glm-naruto-parallelism-summary.js';

export interface GlmNarutoCriticalPathMetrics {
  readonly schema: 'sks.glm-naruto-critical-path.v1';
  readonly total_wall_clock_ms: number;
  readonly stage_wall_clock_ms: {
    readonly decomposition: number;
    readonly patch_generation: number;
    readonly worktree_materialization: number | null;
    readonly candidate_gate: number;
    readonly verifier: number | null;
    readonly conflict_merge: number;
    readonly final_apply: number | null;
    readonly final_seal: number;
  };
  readonly slowest_stage: string;
  readonly parallelism_warnings: readonly string[];
}

export function buildGlmNarutoCriticalPathMetrics(input: {
  readonly totalWallClockMs: number;
  readonly stages: readonly GlmNarutoStageParallelismMetric[];
  readonly decompositionMs: number;
  readonly conflictMergeMs: number;
  readonly finalApplyMs: number | null;
  readonly finalSealMs: number;
  readonly parallelismWarnings: readonly string[];
}): GlmNarutoCriticalPathMetrics {
  const stageMs = (stage: string): number | null => {
    const matches = input.stages.filter((metric) => metric.stage === stage);
    if (!matches.length) return null;
    return matches.reduce((sum, metric) => sum + metric.wall_clock_ms, 0);
  };
  const values = {
    decomposition: input.decompositionMs,
    patch_generation: stageMs('patch_generation') ?? 0,
    worktree_materialization: stageMs('worktree_materialization'),
    candidate_gate: stageMs('candidate_gate') ?? 0,
    verifier: stageMs('verifier'),
    conflict_merge: input.conflictMergeMs,
    final_apply: input.finalApplyMs,
    final_seal: input.finalSealMs
  };
  const slowest = Object.entries(values)
    .filter(([, value]) => typeof value === 'number')
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? 'unknown';
  return {
    schema: 'sks.glm-naruto-critical-path.v1',
    total_wall_clock_ms: Math.max(0, input.totalWallClockMs),
    stage_wall_clock_ms: values,
    slowest_stage: slowest,
    parallelism_warnings: input.parallelismWarnings
  };
}

export async function writeGlmNarutoCriticalPathArtifacts(input: {
  readonly root: string;
  readonly missionId: string;
  readonly metrics: GlmNarutoCriticalPathMetrics;
}): Promise<void> {
  const dir = path.join(input.root, '.sneakoscope', 'glm-naruto', input.missionId);
  await writeJsonAtomic(path.join(dir, 'critical-path.json'), input.metrics);
  await writeTextAtomic(path.join(dir, 'speed-diagnosis.md'), renderSpeedDiagnosis(input.metrics));
}

function renderSpeedDiagnosis(metrics: GlmNarutoCriticalPathMetrics): string {
  return [
    '# GLM Naruto Speed Diagnosis',
    '',
    `Total wall clock: ${metrics.total_wall_clock_ms}ms`,
    `Slowest stage: ${metrics.slowest_stage}`,
    '',
    '## Stage Wall Clock',
    ...Object.entries(metrics.stage_wall_clock_ms).map(([stage, ms]) => `- ${stage}: ${ms === null ? 'not_run' : `${ms}ms`}`),
    '',
    '## Parallelism Warnings',
    metrics.parallelism_warnings.length ? metrics.parallelism_warnings.map((warning) => `- ${warning}`).join('\n') : '- none',
    ''
  ].join('\n');
}

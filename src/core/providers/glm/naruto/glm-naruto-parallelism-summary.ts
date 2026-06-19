import path from 'node:path';
import { writeJsonAtomic, writeTextAtomic } from '../../../fsx.js';
import type {
  GlmNarutoStageEvent,
  GlmNarutoStageName,
  GlmNarutoStageSchedulerResult
} from './glm-naruto-stage-scheduler.js';

export interface GlmNarutoStageParallelismMetric {
  readonly stage: GlmNarutoStageName;
  readonly job_count: number;
  readonly max_observed_active: number;
  readonly wall_clock_ms: number;
  readonly sum_job_duration_ms: number;
  readonly overlap_ratio: number;
}

export interface GlmNarutoParallelismSummary {
  readonly schema: 'sks.glm-naruto-parallelism-summary.v1';
  readonly stages: readonly GlmNarutoStageParallelismMetric[];
  readonly total_wall_clock_ms: number;
  readonly parallelism_effective: boolean;
  readonly blockers: readonly string[];
}

export function metricFromStageResult<TResult>(
  result: GlmNarutoStageSchedulerResult<TResult>
): GlmNarutoStageParallelismMetric {
  return {
    stage: result.stage,
    job_count: result.results.length,
    max_observed_active: result.max_observed_active,
    wall_clock_ms: result.wall_clock_ms,
    sum_job_duration_ms: result.sum_job_duration_ms,
    overlap_ratio: result.overlap_ratio
  };
}

export function createStageParallelismMetric(input: GlmNarutoStageParallelismMetric): GlmNarutoStageParallelismMetric {
  return {
    ...input,
    wall_clock_ms: Math.max(0, input.wall_clock_ms),
    sum_job_duration_ms: Math.max(0, input.sum_job_duration_ms),
    overlap_ratio: input.wall_clock_ms > 0 ? input.sum_job_duration_ms / input.wall_clock_ms : input.overlap_ratio
  };
}

export function buildGlmNarutoParallelismSummary(input: {
  readonly metrics: readonly GlmNarutoStageParallelismMetric[];
  readonly totalWallClockMs: number;
}): GlmNarutoParallelismSummary {
  const grouped = new Map<GlmNarutoStageName, GlmNarutoStageParallelismMetric>();
  for (const metric of input.metrics) {
    const current = grouped.get(metric.stage);
    if (!current) {
      grouped.set(metric.stage, createStageParallelismMetric(metric));
      continue;
    }
    grouped.set(metric.stage, createStageParallelismMetric({
      stage: metric.stage,
      job_count: current.job_count + metric.job_count,
      max_observed_active: Math.max(current.max_observed_active, metric.max_observed_active),
      wall_clock_ms: current.wall_clock_ms + metric.wall_clock_ms,
      sum_job_duration_ms: current.sum_job_duration_ms + metric.sum_job_duration_ms,
      overlap_ratio: 1
    }));
  }

  const stages = [...grouped.values()];
  const blockers = stages
    .filter((stage) => stage.job_count > 1 && stage.overlap_ratio <= 1.1)
    .map((stage) => `glm_parallelism_not_effective:${stage.stage}`);
  return {
    schema: 'sks.glm-naruto-parallelism-summary.v1',
    stages,
    total_wall_clock_ms: Math.max(0, input.totalWallClockMs),
    parallelism_effective: blockers.length === 0,
    blockers
  };
}

export async function writeGlmNarutoParallelismArtifacts(input: {
  readonly root: string;
  readonly missionId: string;
  readonly summary: GlmNarutoParallelismSummary;
  readonly events: readonly GlmNarutoStageEvent[];
}): Promise<void> {
  const dir = path.join(input.root, '.sneakoscope', 'glm-naruto', input.missionId);
  await writeTextAtomic(
    path.join(dir, 'stage-timeline.jsonl'),
    input.events.map((event) => JSON.stringify(event)).join('\n') + (input.events.length ? '\n' : '')
  );
  await writeJsonAtomic(path.join(dir, 'parallelism-summary.json'), input.summary);
}

import { runGlmBenchmark } from '../bench/glm-benchmark-runner.js';
import type { GlmBenchmarkResult } from '../bench/glm-benchmark-types.js';
import { runGlmDirectSpeedRun } from '../glm-direct-run.js';
import { runGlmNarutoMission } from './glm-naruto-orchestrator.js';

export type { GlmBenchmarkResult as GlmNarutoBenchResult } from '../bench/glm-benchmark-types.js';
export type { GlmBenchmarkCaseResult as GlmNarutoBenchCase } from '../bench/glm-benchmark-types.js';

export interface GlmNarutoBenchDeps {
  readonly runDirect?: typeof runGlmDirectSpeedRun;
  readonly runNaruto?: typeof runGlmNarutoMission;
}

export async function runGlmNarutoBench(
  root: string,
  args: readonly string[] = [],
  deps: GlmNarutoBenchDeps = {}
): Promise<GlmBenchmarkResult> {
  return runGlmBenchmark(root, args, deps);
}

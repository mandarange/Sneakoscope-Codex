import path from 'node:path';
import fsp from 'node:fs/promises';
import { writeJsonAtomic } from '../../../fsx.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { runGlmDirectSpeedRun } from '../glm-direct-run.js';
import type { GlmDirectBenchInput, GlmDirectBenchCaseResult } from './glm-benchmark-types.js';

export interface GlmDirectBenchRunnerDeps {
  readonly runDirect?: typeof runGlmDirectSpeedRun;
}

export async function runGlmDirectBenchCase(
  input: GlmDirectBenchInput,
  deps: GlmDirectBenchRunnerDeps = {}
): Promise<GlmDirectBenchCaseResult> {
  const runDirect = deps.runDirect ?? runGlmDirectSpeedRun;
  await fsp.mkdir(input.caseDir, { recursive: true });
  const started = Date.now();

  const directResult = await runDirect({
    cwd: input.fixture.fixture_dir,
    task: input.fixture.task,
    args: ['--bench', '--live', '--dry-run'],
    dryRun: true
  });

  const wallClockMs = Date.now() - started;
  const patchGenerated = directResult.ok || directResult.status === 'blocked';
  const patchGatePassed = directResult.ok;

  const tracePath = path.join(input.caseDir, 'trace.json');
  await writeJsonAtomic(tracePath, {
    schema: 'sks.glm-direct-bench-trace.v1',
    runner_id: 'direct-glm-speed',
    implementation_path: 'direct-glm',
    wall_clock_ms: wallClockMs,
    direct_result: directResult,
    called_naruto: false,
    model: GLM_52_OPENROUTER_MODEL
  });

  const latencyMeasured = wallClockMs > 0;

  const result: GlmDirectBenchCaseResult = {
    schema: 'sks.glm-benchmark-case.v1',
    name: 'Direct GLM speed path',
    kind: 'direct-glm',
    runner_id: 'direct-glm-speed',
    implementation_path: 'direct-glm',
    workers: 1,
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    no_apply: true,
    mutation_performed: false,
    wall_clock_ms: wallClockMs,
    p50_ttft_ms: null,
    p90_ttft_ms: null,
    p50_total_ms: null,
    p90_total_ms: null,
    candidate_count: null,
    gate_pass_rate: null,
    verifier_pass_rate: null,
    merge_success: null,
    patch_generated: patchGenerated ? true : (patchGenerated === false ? false : null),
    patch_gate_passed: patchGatePassed ? true : (patchGatePassed === false ? false : null),
    cached_tokens_sum: null,
    cache_write_tokens_sum: null,
    reasoning_tokens_sum: null,
    metric_status: {
      latency: latencyMeasured ? 'measured' : 'unavailable',
      usage: 'unavailable',
      candidate: 'not_applicable',
      verifier: 'not_applicable',
      merge: 'not_applicable'
    },
    artifacts: {
      case_dir: input.caseDir,
      trace_path: tracePath,
      mission_artifact_dir: null
    },
    blockers: directResult.blockers,
    warnings: directResult.warnings
  };

  await writeJsonAtomic(path.join(input.caseDir, 'case-result.json'), result);
  return result;
}

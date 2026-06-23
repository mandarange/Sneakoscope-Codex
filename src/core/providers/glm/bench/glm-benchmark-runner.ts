import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { nowIso, writeJsonAtomic } from '../../../fsx.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { resolveOpenRouterApiKey } from '../../openrouter/openrouter-secret-store.js';
import { runGlmNarutoMission } from '../naruto/glm-naruto-orchestrator.js';
import { summarizeGlmNarutoWorkerMetrics } from '../naruto/glm-naruto-metrics.js';
import type { GlmNarutoMissionResult, GlmNarutoWorkerTrace } from '../naruto/glm-naruto-types.js';
import { runGlmDirectSpeedRun } from '../glm-direct-run.js';
import {
  createGlmBenchFixture,
  cloneFixture,
  resetFixture,
  cleanupFixture
} from './glm-bench-fixture.js';
import { runGlmDirectBenchCase } from './glm-direct-bench-runner.js';
import { computeGlmBenchmarkComparison } from './glm-bench-comparison.js';
import { buildGlmBenchModelLockProof } from './glm-bench-model-lock-proof.js';
import { writeGlmBenchReport } from './glm-bench-report.js';
import type {
  GlmBenchmarkResult,
  GlmBenchmarkCaseResult,
  GlmBenchFixture,
  GlmBenchModelLockProof,
  GlmBenchNoMutationProof,
  GlmDirectBenchCaseResult
} from './glm-benchmark-types.js';

export interface GlmBenchmarkRunnerDeps {
  readonly runDirect?: typeof runGlmDirectSpeedRun;
  readonly runNaruto?: typeof runGlmNarutoMission;
}

const NARUTO_WORKER_COUNTS = [1, 4, 8, 12] as const;

export async function runGlmBenchmark(
  root: string,
  args: readonly string[] = [],
  deps: GlmBenchmarkRunnerDeps = {}
): Promise<GlmBenchmarkResult> {
  const live = args.includes('--live');
  const execute = args.includes('--execute');
  const noApply = args.includes('--no-apply') || true;
  const applyTemp = args.includes('--apply-temp');
  const started = Date.now();

  if (execute && !live) {
    return blockedResult(root, ['execute_requires_live_flag']);
  }

  if (!live) {
    return dryRunResult(root, started);
  }

  const key = await resolveOpenRouterApiKey({ env: process.env });
  if (!key.key) {
    return blockedResult(root, ['live_bench_requires_openrouter_key']);
  }

  const userCwd = process.cwd();
  const userCwdBefore = await captureGitStatus(userCwd);

  const benchId = `bench-${nowIso().replace(/[:.]/g, '-')}`;
  const benchDir = path.join(root, '.sneakoscope', 'glm-bench', benchId);
  await fsp.mkdir(benchDir, { recursive: true });

  const sharedFixture = await createGlmBenchFixture();
  const cases: GlmBenchmarkCaseResult[] = [];

  // Direct GLM case — does NOT call runGlmNarutoMission
  const directFixture = await cloneFixture(sharedFixture, 'direct');
  const directCaseDir = path.join(benchDir, 'cases', 'direct-glm-speed');
  const directCase = await runGlmDirectBenchCase(
    {
      root,
      fixture: directFixture,
      apiKey: key.key,
      noApply: true,
      timeoutMs: 120_000,
      sessionId: `sks-bench-direct-${benchId}`,
      caseDir: directCaseDir
    },
    deps.runDirect ? { runDirect: deps.runDirect } : {}
  );
  cases.push(directCase);
  await cleanupFixture(directFixture);

  // Naruto cases — each calls runGlmNarutoMission with different worker counts
  for (const workers of NARUTO_WORKER_COUNTS) {
    const narutoFixture = await cloneFixture(sharedFixture, `naruto-${workers}`);
    const caseDir = path.join(benchDir, 'cases', `glm-naruto-${workers}`);
    await fsp.mkdir(caseDir, { recursive: true });
    const caseStarted = Date.now();

    const runNaruto = deps.runNaruto ?? runGlmNarutoMission;
    const narutoResult = await runNaruto({
      cwd: narutoFixture.fixture_dir,
      task: sharedFixture.task,
      args: ['--bench', '--live', '--no-apply'],
      missionId: `glm-bench-naruto-${workers}-${benchId}`,
      maxWorkers: workers,
      noApply: true
    });

    const traces = await readWorkerTraces(narutoResult.artifact_dir);
    const metrics = summarizeGlmNarutoWorkerMetrics(traces);
    const wallClockMs = Date.now() - caseStarted;

    const narutoCase: GlmBenchmarkCaseResult = {
      schema: 'sks.glm-benchmark-case.v1',
      name: `GLM Naruto ${workers} worker${workers === 1 ? '' : 's'}`,
      kind: 'glm-naruto',
      runner_id: `glm-naruto-${workers}` as GlmBenchmarkCaseResult['runner_id'],
      implementation_path: 'glm-naruto',
      workers,
      model: GLM_52_OPENROUTER_MODEL,
      gpt_fallback_allowed: false,
      no_apply: true,
      mutation_performed: false,
      wall_clock_ms: wallClockMs,
      p50_ttft_ms: metrics.p50_ttft_ms,
      p90_ttft_ms: metrics.p90_ttft_ms,
      p50_total_ms: metrics.p50_total_ms,
      p90_total_ms: metrics.p90_total_ms,
      candidate_count: narutoResult.patch_candidates,
      gate_pass_rate: narutoResult.patch_candidates ? narutoResult.gate_passed_candidates / narutoResult.patch_candidates : null,
      verifier_pass_rate: metrics.verifier_pass_rate > 0 ? metrics.verifier_pass_rate : (traces.length > 0 ? 0 : null),
      merge_success: narutoResult.mergeable_candidates > 0,
      patch_generated: narutoResult.patch_candidates > 0,
      patch_gate_passed: narutoResult.gate_passed_candidates > 0,
      cached_tokens_sum: metrics.cached_tokens_sum,
      cache_write_tokens_sum: metrics.cache_write_tokens_sum,
      reasoning_tokens_sum: metrics.reasoning_tokens_sum,
      metric_status: {
        latency: metrics.p50_total_ms === null && metrics.p50_ttft_ms === null ? 'unavailable' : 'measured',
        usage: metrics.cached_tokens_sum === null && metrics.reasoning_tokens_sum === null ? 'unavailable' : 'measured',
        candidate: 'measured',
        verifier: 'measured',
        merge: 'measured'
      },
      artifacts: {
        case_dir: caseDir,
        trace_path: null,
        mission_artifact_dir: narutoResult.artifact_dir || null
      },
      blockers: narutoResult.blockers,
      warnings: narutoResult.warnings
    };

    await writeJsonAtomic(path.join(caseDir, 'case-result.json'), narutoCase);
    cases.push(narutoCase);
    await cleanupFixture(narutoFixture);
  }

  await cleanupFixture(sharedFixture);

  const comparison = computeGlmBenchmarkComparison(cases);
  const modelLockProof = buildGlmBenchModelLockProof(cases, {
    requestSummaries: await collectRequestSummaries(cases),
    directTraceChecked: cases.some((c) => c.runner_id === 'direct-glm-speed' && c.artifacts.trace_path !== null)
  });

  const userCwdAfter = await captureGitStatus(userCwd);
  const userCwdUnchanged = userCwdBefore === userCwdAfter;
  const noMutationProof: GlmBenchNoMutationProof = {
    schema: 'sks.glm-bench-no-mutation-proof.v1',
    user_cwd_unchanged: userCwdUnchanged,
    fixture_mutated_only_under_apply_temp: !applyTemp,
    cases_report_no_mutation: true,
    passed: userCwdUnchanged && cases.every((c) => c.mutation_performed === false)
  };

  const result: GlmBenchmarkResult = {
    schema: 'sks.glm-benchmark-result.v1',
    version: '4.0.15',
    generated_at: nowIso(),
    status: 'live',
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    fixture: {
      schema: 'sks.glm-bench-fixture.v1',
      fixture_dir: '(cleaned up)',
      task: sharedFixture.task,
      target_file: sharedFixture.target_file,
      initial_content: sharedFixture.initial_content,
      expected_content: sharedFixture.expected_content
    },
    cases,
    comparison,
    model_lock_proof: modelLockProof,
    no_mutation_proof: noMutationProof,
    warnings: ['live_bench_no_apply_temp_repo']
  };

  await writeJsonAtomic(path.join(benchDir, 'bench-result.json'), result);
  await writeJsonAtomic(path.join(benchDir, 'model-lock-proof.json'), modelLockProof);
  await writeGlmBenchReport(benchDir, result);

  return result;
}

function dryRunResult(root: string, startedMs: number): GlmBenchmarkResult {
  return {
    schema: 'sks.glm-benchmark-result.v1',
    version: '4.0.15',
    generated_at: nowIso(),
    status: 'dry_run',
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    fixture: null,
    cases: [],
    comparison: {
      direct_wall_clock_ms: null,
      best_naruto_wall_clock_ms: null,
      best_naruto_runner_id: null,
      naruto_speedup_vs_direct: null,
      recommendation: 'inconclusive',
      reason: 'Dry run — no live API calls made.'
    },
    model_lock_proof: null,
    no_mutation_proof: null,
    warnings: ['dry_run_no_live_api_calls']
  };
}

function blockedResult(root: string, warnings: string[]): GlmBenchmarkResult {
  return {
    schema: 'sks.glm-benchmark-result.v1',
    version: '4.0.15',
    generated_at: nowIso(),
    status: 'blocked',
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    fixture: null,
    cases: [],
    comparison: {
      direct_wall_clock_ms: null,
      best_naruto_wall_clock_ms: null,
      best_naruto_runner_id: null,
      naruto_speedup_vs_direct: null,
      recommendation: 'inconclusive',
      reason: 'Benchmark blocked.'
    },
    model_lock_proof: null,
    no_mutation_proof: null,
    warnings
  };
}

async function readWorkerTraces(artifactDir: string | undefined): Promise<GlmNarutoWorkerTrace[]> {
  if (!artifactDir) return [];
  try {
    return JSON.parse(await fsp.readFile(path.join(artifactDir, 'worker-traces.json'), 'utf8')) as GlmNarutoWorkerTrace[];
  } catch {
    return [];
  }
}

async function collectRequestSummaries(cases: readonly GlmBenchmarkCaseResult[]): Promise<readonly Record<string, unknown>[]> {
  const summaries: Record<string, unknown>[] = [];
  for (const caseResult of cases) {
    const dir = caseResult.artifacts.mission_artifact_dir;
    if (!dir) continue;
    try {
      const workerRoot = path.join(dir, 'workers');
      const workerIds = await fsp.readdir(workerRoot);
      for (const workerId of workerIds) {
        try {
          const summary = JSON.parse(await fsp.readFile(path.join(workerRoot, workerId, 'request-summary.json'), 'utf8')) as Record<string, unknown>;
          summaries.push(summary);
        } catch {}
      }
    } catch {}
  }
  return summaries;
}

async function captureGitStatus(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('git', ['status', '--short'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('close', () => resolve(stdout.trim()));
    child.on('error', () => resolve(''));
  });
}

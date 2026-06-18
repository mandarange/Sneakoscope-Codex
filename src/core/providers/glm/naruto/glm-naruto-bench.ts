import { nowIso, writeTextAtomic } from '../../../fsx.js';
import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { runGlmDirectSpeedRun, type GlmDirectRunResult } from '../glm-direct-run.js';
import { resolveOpenRouterApiKey } from '../../openrouter/openrouter-secret-store.js';
import { runGlmNarutoMission } from './glm-naruto-orchestrator.js';
import { summarizeGlmNarutoWorkerMetrics } from './glm-naruto-metrics.js';
import type { GlmNarutoMissionResult, GlmNarutoWorkerTrace } from './glm-naruto-types.js';

export interface GlmNarutoBenchCase {
  readonly name: string;
  readonly kind: 'direct-glm' | 'glm-naruto';
  readonly workers: number;
  readonly wall_clock_ms: number;
  readonly p50_ttft_ms: number | null;
  readonly p90_ttft_ms: number | null;
  readonly p50_total_ms: number | null;
  readonly p90_total_ms: number | null;
  readonly candidate_count: number;
  readonly gate_pass_rate: number | null;
  readonly verifier_pass_rate: number | null;
  readonly merge_success: boolean | null;
  readonly cached_tokens_sum: number | null;
  readonly cache_write_tokens_sum: number | null;
  readonly reasoning_tokens_sum: number | null;
  readonly metric_status: 'measured' | 'unavailable' | 'not_applicable';
  readonly workers_completed?: number;
  readonly workers_failed?: number;
}

export interface GlmNarutoBenchResult {
  readonly schema: 'sks.glm-naruto-bench.v1';
  readonly version: '4.0.12';
  readonly generated_at: string;
  readonly status: 'dry_run' | 'live' | 'blocked';
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
  readonly cases?: readonly GlmNarutoBenchCase[];
  readonly summary: {
    readonly simulated_workers: number;
    readonly simulated_waves: number;
    readonly simulated_patch_candidates: number;
    readonly simulated_gate_passed: number;
    readonly simulated_mergeable: number;
    readonly wall_clock_ms: number;
  };
  readonly warnings: readonly string[];
}

export interface GlmNarutoBenchDeps {
  readonly runDirect?: typeof runGlmDirectSpeedRun;
  readonly runNaruto?: typeof runGlmNarutoMission;
}

export async function runGlmNarutoBench(root: string, args: readonly string[] = [], deps: GlmNarutoBenchDeps = {}): Promise<GlmNarutoBenchResult> {
  const live = args.includes('--live');
  const execute = args.includes('--execute');
  const started = Date.now();
  const runDirect = deps.runDirect ?? runGlmDirectSpeedRun;
  const runNaruto = deps.runNaruto ?? runGlmNarutoMission;

  if (execute && !live) {
    return blocked(root, ['execute_requires_live_flag']);
  }

  if (!live) {
    return {
      schema: 'sks.glm-naruto-bench.v1',
      version: '4.0.12',
      generated_at: nowIso(),
      status: 'dry_run',
      model: GLM_52_OPENROUTER_MODEL,
      gpt_fallback_allowed: false,
      summary: {
        simulated_workers: 12,
        simulated_waves: 3,
        simulated_patch_candidates: 24,
        simulated_gate_passed: 18,
        simulated_mergeable: 12,
        wall_clock_ms: Date.now() - started
      },
      warnings: ['dry_run_no_live_api_calls']
    };
  }

  const key = await resolveOpenRouterApiKey({ env: process.env });
  if (!key.key) return blocked(root, ['live_bench_requires_openrouter_key']);

  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-naruto-live-bench-'));
  await fsp.mkdir(path.join(fixture, 'src'), { recursive: true });
  await fsp.writeFile(path.join(fixture, 'src', 'bench-target.ts'), 'export const value = 1;\n', 'utf8');
  const cases: GlmNarutoBenchCase[] = [];
  const directStarted = Date.now();
  const direct = await runDirect({
    cwd: fixture,
    task: 'Change src/bench-target.ts so value is 2. Return the smallest patch only.',
    args: ['--bench', '--live', '--dry-run'],
    dryRun: true
  });
  cases.push(directBenchCase(direct, Date.now() - directStarted));

  for (const workers of [1, 4, 8, 12]) {
    const caseStarted = Date.now();
    const result = await runNaruto({
      cwd: fixture,
      task: 'Change src/bench-target.ts so value is 2. Return the smallest patch only.',
      args: ['--bench', '--live', '--no-apply'],
      missionId: `glm-naruto-live-bench-${workers}-${Date.now()}`,
      maxWorkers: workers,
      noApply: true
    });
    const traces = await readWorkerTraces(result.artifact_dir);
    const metrics = summarizeGlmNarutoWorkerMetrics(traces);
    cases.push({
      name: `GLM Naruto ${workers} worker${workers === 1 ? '' : 's'}`,
      kind: 'glm-naruto',
      workers,
      wall_clock_ms: Date.now() - caseStarted,
      p50_ttft_ms: metrics.p50_ttft_ms,
      p90_ttft_ms: metrics.p90_ttft_ms,
      p50_total_ms: metrics.p50_total_ms,
      p90_total_ms: metrics.p90_total_ms,
      candidate_count: result.patch_candidates,
      gate_pass_rate: result.patch_candidates ? result.gate_passed_candidates / result.patch_candidates : null,
      verifier_pass_rate: metrics.verifier_pass_rate,
      merge_success: result.mergeable_candidates > 0,
      cached_tokens_sum: metrics.cached_tokens_sum,
      cache_write_tokens_sum: metrics.cache_write_tokens_sum,
      reasoning_tokens_sum: metrics.reasoning_tokens_sum,
      metric_status: metrics.p50_total_ms === null && metrics.p50_ttft_ms === null ? 'unavailable' : 'measured',
      workers_completed: metrics.workers_completed,
      workers_failed: metrics.workers_failed
    });
  }
  await writeBenchReport(root, cases).catch(() => undefined);

  return {
    schema: 'sks.glm-naruto-bench.v1',
    version: '4.0.12',
    generated_at: nowIso(),
    status: 'live',
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    cases,
    summary: {
      simulated_workers: Math.max(...cases.map((row) => row.workers)),
      simulated_waves: cases.length,
      simulated_patch_candidates: cases.reduce((sum, row) => sum + row.candidate_count, 0),
      simulated_gate_passed: cases.reduce((sum, row) => sum + Math.round(row.candidate_count * (row.gate_pass_rate ?? 0)), 0),
      simulated_mergeable: cases.filter((row) => row.merge_success).length,
      wall_clock_ms: Date.now() - started
    },
    warnings: ['live_bench_no_apply_temp_repo']
  };
}

async function writeBenchReport(root: string, cases: readonly GlmNarutoBenchCase[]): Promise<void> {
  const rows = cases.map((row) => [
    row.name,
    row.kind,
    String(row.workers),
    String(row.wall_clock_ms),
    String(row.p50_ttft_ms ?? 'unavailable'),
    String(row.p90_ttft_ms ?? 'unavailable'),
    String(row.p50_total_ms ?? 'unavailable'),
    String(row.p90_total_ms ?? 'unavailable'),
    String(row.gate_pass_rate ?? 'n/a'),
    String(row.verifier_pass_rate ?? 'n/a'),
    String(row.metric_status)
  ]);
  const fastest = [...cases].sort((a, b) => a.wall_clock_ms - b.wall_clock_ms)[0] ?? null;
  const md = [
    '# GLM Naruto Bench Report',
    '',
    `Generated: ${nowIso()}`,
    `Model: ${GLM_52_OPENROUTER_MODEL}`,
    '',
    '| Case | Kind | Workers | Wall ms | TTFT p50 | TTFT p90 | Total p50 | Total p90 | Gate pass | Verifier pass | Metric status |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    `Fastest wall-clock case: ${fastest ? fastest.name : 'unavailable'}`,
    'Missing usage metrics are reported as `unavailable` or `n/a`, never as fake zero.',
    ''
  ].join('\n');
  await writeTextAtomic(path.join(root, '.sneakoscope', 'glm-naruto', 'bench-report.md'), md);
}

function blocked(root: string, warnings: string[]): GlmNarutoBenchResult {
  return {
    schema: 'sks.glm-naruto-bench.v1',
    version: '4.0.12',
    generated_at: nowIso(),
    status: 'blocked',
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    summary: {
      simulated_workers: 0,
      simulated_waves: 0,
      simulated_patch_candidates: 0,
      simulated_gate_passed: 0,
      simulated_mergeable: 0,
      wall_clock_ms: 0
    },
    warnings
  };
}

function directBenchCase(result: GlmDirectRunResult, wallClockMs: number): GlmNarutoBenchCase {
  return {
    name: 'direct GLM speed path',
    kind: 'direct-glm',
    workers: 1,
    wall_clock_ms: wallClockMs,
    p50_ttft_ms: null,
    p90_ttft_ms: null,
    p50_total_ms: null,
    p90_total_ms: null,
    candidate_count: result.ok ? 1 : 0,
    gate_pass_rate: result.ok ? 1 : null,
    verifier_pass_rate: null,
    merge_success: result.ok,
    cached_tokens_sum: null,
    cache_write_tokens_sum: null,
    reasoning_tokens_sum: null,
    metric_status: 'unavailable'
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

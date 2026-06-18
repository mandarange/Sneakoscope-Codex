import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../../fsx.js';
import { profileFromConst } from './glm-profile-resolver.js';
import { createEmptyGlmLatencyTrace, writeGlmLatencyTrace } from './glm-latency-trace.js';

export interface GlmBenchResult {
  readonly schema: 'sks.glm-bench-result.v1';
  readonly version: '4.0.8';
  readonly generated_at: string;
  readonly status: 'dry_run' | 'live' | 'blocked';
  readonly dry_run: boolean;
  readonly cases: readonly GlmBenchCaseResult[];
  readonly summary: {
    readonly speed_p50_total_ms: number;
    readonly speed_p90_total_ms: number;
    readonly speed_p50_ttft_ms: number | null;
    readonly deep_p50_total_ms?: number;
    readonly gpt_p50_total_ms?: number;
    readonly speed_vs_deep_ratio?: number;
    readonly speed_vs_gpt_ratio?: number;
  };
  readonly warnings: readonly string[];
}

export interface GlmBenchCaseResult {
  readonly name: string;
  readonly task_kind: 'doc_edit' | 'small_edit' | 'test_fix' | 'config_edit';
  readonly speed: GlmBenchModeResult;
  readonly deep: GlmBenchModeResult;
}

export interface GlmBenchModeResult {
  readonly mode: 'speed' | 'deep';
  readonly synthetic: true;
  readonly llm_calls: 1;
  readonly max_tokens: number;
  readonly context_target_tokens: number;
  readonly total_ms: number;
  readonly ttft_ms: number | null;
}

const SYNTHETIC_CASES: readonly GlmBenchCaseResult[] = Object.freeze([
  benchCase('small doc edit', 'doc_edit', 420, 980),
  benchCase('small TS function edit', 'small_edit', 460, 1100),
  benchCase('failing test fix from small error', 'test_fix', 520, 1220),
  benchCase('simple config edit', 'config_edit', 390, 930)
]);

export async function runGlmBench(root: string, args: readonly string[] = []): Promise<GlmBenchResult> {
  const live = args.includes('--live');
  const execute = args.includes('--execute');
  if (execute && !live) {
    const blocked: GlmBenchResult = {
      schema: 'sks.glm-bench-result.v1',
      version: '4.0.8',
      generated_at: nowIso(),
      status: 'blocked',
      dry_run: true,
      cases: [],
      summary: {
        speed_p50_total_ms: 0,
        speed_p90_total_ms: 0,
        speed_p50_ttft_ms: null
      },
      warnings: ['execute_requested_but_live_openrouter_bench_not_implemented']
    };
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'glm', 'bench-blocked.json'), blocked);
    return blocked;
  }
  if (live) {
    const blocked: GlmBenchResult = {
      schema: 'sks.glm-bench-result.v1',
      version: '4.0.8',
      generated_at: nowIso(),
      status: 'blocked',
      dry_run: false,
      cases: [],
      summary: {
        speed_p50_total_ms: 0,
        speed_p90_total_ms: 0,
        speed_p50_ttft_ms: null
      },
      warnings: ['live_openrouter_bench_requires_explicit_network_runner_not_enabled_in_this_build']
    };
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'glm', 'bench-live-blocked.json'), blocked);
    return blocked;
  }
  if (execute) {
    const blocked: GlmBenchResult = {
      schema: 'sks.glm-bench-result.v1',
      version: '4.0.8',
      generated_at: nowIso(),
      status: 'blocked',
      dry_run: true,
      cases: [],
      summary: {
        speed_p50_total_ms: 0,
        speed_p90_total_ms: 0,
        speed_p50_ttft_ms: null
      },
      warnings: ['execute_requested_without_live_flag_uses_no_network_dry_run_policy']
    };
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'glm', 'bench-blocked.json'), blocked);
    return blocked;
  }
  const speedTotals = SYNTHETIC_CASES.map((row) => row.speed.total_ms);
  const deepTotals = SYNTHETIC_CASES.map((row) => row.deep.total_ms);
  const result: GlmBenchResult = {
    schema: 'sks.glm-bench-result.v1',
    version: '4.0.8',
    generated_at: nowIso(),
    status: 'dry_run',
    dry_run: true,
    cases: SYNTHETIC_CASES,
    summary: {
      speed_p50_total_ms: percentile(speedTotals, 50),
      speed_p90_total_ms: percentile(speedTotals, 90),
      speed_p50_ttft_ms: null,
      deep_p50_total_ms: percentile(deepTotals, 50),
      speed_vs_deep_ratio: Number((percentile(speedTotals, 50) / percentile(deepTotals, 50)).toFixed(3))
    },
    warnings: ['synthetic_dry_run_no_network_no_gpt_key_required']
  };
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'glm', 'bench-result.json'), result);
  await writeGlmLatencyTrace(root, {
    ...createEmptyGlmLatencyTrace('speed'),
    total_ms: result.summary.speed_p50_total_ms,
    context_estimated_tokens: 16_000,
    request_encode_ms: 1,
    encoded_request_cache_hit: true
  });
  return result;
}

function benchCase(
  name: string,
  taskKind: GlmBenchCaseResult['task_kind'],
  speedMs: number,
  deepMs: number
): GlmBenchCaseResult {
  return {
    name,
    task_kind: taskKind,
    speed: {
      mode: 'speed',
      synthetic: true,
      llm_calls: 1,
      max_tokens: profileFromConst('speed').max_tokens,
      context_target_tokens: 16_000,
      total_ms: speedMs,
      ttft_ms: null
    },
    deep: {
      mode: 'deep',
      synthetic: true,
      llm_calls: 1,
      max_tokens: profileFromConst('deep').max_tokens,
      context_target_tokens: 64_000,
      total_ms: deepMs,
      ttft_ms: null
    }
  };
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] || 0;
}

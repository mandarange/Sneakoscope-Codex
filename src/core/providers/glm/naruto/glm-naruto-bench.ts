import { nowIso, writeJsonAtomic } from '../../../fsx.js';
import path from 'node:path';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';

export interface GlmNarutoBenchResult {
  readonly schema: 'sks.glm-naruto-bench.v1';
  readonly version: '4.0.8';
  readonly generated_at: string;
  readonly status: 'dry_run' | 'live' | 'blocked';
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
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

export async function runGlmNarutoBench(root: string, args: readonly string[] = []): Promise<GlmNarutoBenchResult> {
  const live = args.includes('--live');
  const execute = args.includes('--execute');
  const started = Date.now();

  if (execute && !live) {
    return blocked(root, ['execute_requires_live_flag']);
  }

  if (!live) {
    return {
      schema: 'sks.glm-naruto-bench.v1',
      version: '4.0.8',
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

  // Live bench would require OpenRouter key and real API calls
  return {
    schema: 'sks.glm-naruto-bench.v1',
    version: '4.0.8',
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
      wall_clock_ms: Date.now() - started
    },
    warnings: ['live_bench_requires_openrouter_key_and_task']
  };
}

function blocked(root: string, warnings: string[]): GlmNarutoBenchResult {
  return {
    schema: 'sks.glm-naruto-bench.v1',
    version: '4.0.8',
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

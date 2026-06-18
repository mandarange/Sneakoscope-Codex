import { nowIso } from '../../../fsx.js';
import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { resolveOpenRouterApiKey } from '../../openrouter/openrouter-secret-store.js';
import { runGlmNarutoMission } from './glm-naruto-orchestrator.js';

export interface GlmNarutoBenchResult {
  readonly schema: 'sks.glm-naruto-bench.v1';
  readonly version: '4.0.10';
  readonly generated_at: string;
  readonly status: 'dry_run' | 'live' | 'blocked';
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
  readonly cases?: readonly {
    readonly name: string;
    readonly workers: number;
    readonly wall_clock_ms: number;
    readonly p50_ttft_ms: number | null;
    readonly p90_ttft_ms: number | null;
    readonly candidate_count: number;
    readonly gate_pass_rate: number;
    readonly verifier_pass_rate: number;
    readonly merge_success: boolean;
    readonly cached_tokens: number;
    readonly cache_write_tokens: number;
  }[];
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
      version: '4.0.10',
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
  const cases = [];
  for (const workers of [1, 4, 8, 12]) {
    const caseStarted = Date.now();
    const result = await runGlmNarutoMission({
      cwd: fixture,
      task: 'Change src/bench-target.ts so value is 2. Return the smallest patch only.',
      args: ['--bench', '--live', '--no-apply'],
      missionId: `glm-naruto-live-bench-${workers}-${Date.now()}`,
      maxWorkers: workers,
      noApply: true
    });
    cases.push({
      name: workers === 1 ? 'direct single GLM' : `GLM Naruto ${workers} workers`,
      workers,
      wall_clock_ms: Date.now() - caseStarted,
      p50_ttft_ms: null,
      p90_ttft_ms: null,
      candidate_count: result.patch_candidates,
      gate_pass_rate: result.patch_candidates ? result.gate_passed_candidates / result.patch_candidates : 0,
      verifier_pass_rate: 0,
      merge_success: result.mergeable_candidates > 0,
      cached_tokens: 0,
      cache_write_tokens: 0
    });
  }

  return {
    schema: 'sks.glm-naruto-bench.v1',
    version: '4.0.10',
    generated_at: nowIso(),
    status: 'live',
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    cases,
    summary: {
      simulated_workers: Math.max(...cases.map((row) => row.workers)),
      simulated_waves: cases.length,
      simulated_patch_candidates: cases.reduce((sum, row) => sum + row.candidate_count, 0),
      simulated_gate_passed: cases.reduce((sum, row) => sum + Math.round(row.candidate_count * row.gate_pass_rate), 0),
      simulated_mergeable: cases.filter((row) => row.merge_success).length,
      wall_clock_ms: Date.now() - started
    },
    warnings: ['live_bench_no_apply_temp_repo']
  };
}

function blocked(root: string, warnings: string[]): GlmNarutoBenchResult {
  return {
    schema: 'sks.glm-naruto-bench.v1',
    version: '4.0.10',
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

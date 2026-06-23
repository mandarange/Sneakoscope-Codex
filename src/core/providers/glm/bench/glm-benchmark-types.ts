import type { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';

export const GLM_BENCHMARK_VERSION = '4.1.0' as const;

export type GlmBenchmarkRunnerId =
  | 'direct-glm-speed'
  | 'glm-naruto-1'
  | 'glm-naruto-4'
  | 'glm-naruto-8'
  | 'glm-naruto-12';

export type GlmBenchmarkImplementationPath = 'direct-glm' | 'glm-naruto';

export type GlmBenchmarkMetricStatusValue = 'measured' | 'unavailable' | 'not_applicable';

export interface GlmBenchFixture {
  readonly schema: 'sks.glm-bench-fixture.v1';
  readonly fixture_dir: string;
  readonly task: string;
  readonly target_file: string;
  readonly initial_content: string;
  readonly expected_content: string;
}

export interface GlmBenchmarkMetricStatus {
  readonly latency: GlmBenchmarkMetricStatusValue;
  readonly usage: GlmBenchmarkMetricStatusValue;
  readonly candidate: GlmBenchmarkMetricStatusValue;
  readonly verifier: GlmBenchmarkMetricStatusValue;
  readonly merge: GlmBenchmarkMetricStatusValue;
}

export interface GlmBenchmarkCaseArtifacts {
  readonly case_dir: string;
  readonly trace_path: string | null;
  readonly mission_artifact_dir: string | null;
}

export interface GlmBenchmarkCaseResult {
  readonly schema: 'sks.glm-benchmark-case.v1';
  readonly name: string;
  readonly kind: 'direct-glm' | 'glm-naruto';
  readonly runner_id: GlmBenchmarkRunnerId;
  readonly implementation_path: GlmBenchmarkImplementationPath;
  readonly workers: number;
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
  readonly no_apply: true;
  readonly mutation_performed: false;
  readonly wall_clock_ms: number;
  readonly p50_ttft_ms: number | null;
  readonly p90_ttft_ms: number | null;
  readonly p50_total_ms: number | null;
  readonly p90_total_ms: number | null;
  readonly candidate_count: number | null;
  readonly gate_pass_rate: number | null;
  readonly verifier_pass_rate: number | null;
  readonly merge_success: boolean | null;
  readonly patch_generated: boolean | null;
  readonly patch_gate_passed: boolean | null;
  readonly cached_tokens_sum: number | null;
  readonly cache_write_tokens_sum: number | null;
  readonly reasoning_tokens_sum: number | null;
  readonly metric_status: GlmBenchmarkMetricStatus;
  readonly artifacts: GlmBenchmarkCaseArtifacts;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface GlmBenchmarkComparison {
  readonly direct_wall_clock_ms: number | null;
  readonly best_naruto_wall_clock_ms: number | null;
  readonly best_naruto_runner_id: string | null;
  readonly naruto_speedup_vs_direct: number | null;
  readonly recommendation: 'direct-glm' | 'glm-naruto' | 'inconclusive';
  readonly reason: string;
}

export interface GlmBenchmarkResult {
  readonly schema: 'sks.glm-benchmark-result.v1';
  readonly version: '4.1.0';
  readonly generated_at: string;
  readonly status: 'dry_run' | 'live' | 'blocked';
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
  readonly fixture: GlmBenchFixture | null;
  readonly cases: readonly GlmBenchmarkCaseResult[];
  readonly comparison: GlmBenchmarkComparison;
  readonly model_lock_proof: GlmBenchModelLockProof | null;
  readonly no_mutation_proof: GlmBenchNoMutationProof | null;
  readonly warnings: readonly string[];
}

export interface GlmBenchModelLockProof {
  readonly schema: 'sks.glm-bench-model-lock-proof.v1';
  readonly checked_cases: readonly string[];
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
  readonly request_summary_status: 'checked' | 'unavailable';
  readonly request_summaries_checked: number;
  readonly request_summaries_unavailable: number;
  readonly naruto_request_summaries_checked: number;
  readonly direct_trace_checked: boolean;
  readonly fallback_arrays_found: number;
  readonly openai_key_used: boolean;
  readonly fallback_array_scan: 'checked' | 'unavailable';
  readonly openai_key_usage_scan: 'checked' | 'unavailable';
  readonly mismatches: readonly string[];
  readonly passed: boolean;
}

export interface GlmBenchNoMutationProof {
  readonly schema: 'sks.glm-bench-no-mutation-proof.v1';
  readonly user_cwd_unchanged: boolean;
  readonly fixture_mutated_only_under_apply_temp: boolean;
  readonly cases_report_no_mutation: true;
  readonly passed: boolean;
}

export interface GlmDirectBenchInput {
  readonly root: string;
  readonly fixture: GlmBenchFixture;
  readonly apiKey: string;
  readonly noApply: true;
  readonly timeoutMs: number;
  readonly sessionId: string;
  readonly caseDir: string;
}

export interface GlmDirectBenchCaseResult {
  readonly schema: 'sks.glm-benchmark-case.v1';
  readonly name: string;
  readonly kind: 'direct-glm';
  readonly runner_id: 'direct-glm-speed';
  readonly implementation_path: 'direct-glm';
  readonly workers: 1;
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
  readonly no_apply: true;
  readonly mutation_performed: false;
  readonly wall_clock_ms: number;
  readonly p50_ttft_ms: number | null;
  readonly p90_ttft_ms: number | null;
  readonly p50_total_ms: number | null;
  readonly p90_total_ms: number | null;
  readonly candidate_count: null;
  readonly gate_pass_rate: null;
  readonly verifier_pass_rate: null;
  readonly merge_success: null;
  readonly patch_generated: boolean | null;
  readonly patch_gate_passed: boolean | null;
  readonly cached_tokens_sum: number | null;
  readonly cache_write_tokens_sum: number | null;
  readonly reasoning_tokens_sum: number | null;
  readonly metric_status: {
    readonly latency: 'measured' | 'unavailable';
    readonly usage: 'measured' | 'unavailable';
    readonly candidate: 'not_applicable';
    readonly verifier: 'not_applicable';
    readonly merge: 'not_applicable';
  };
  readonly artifacts: GlmBenchmarkCaseArtifacts;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

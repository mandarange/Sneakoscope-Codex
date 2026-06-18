import type { GlmNarutoWorkerTrace } from './glm-naruto-types.js';

export interface GlmNarutoBenchMetrics {
  readonly p50_ttft_ms: number | null;
  readonly p90_ttft_ms: number | null;
  readonly p50_total_ms: number | null;
  readonly p90_total_ms: number | null;
  readonly cached_tokens_sum: number | null;
  readonly cache_write_tokens_sum: number | null;
  readonly reasoning_tokens_sum: number | null;
  readonly workers_completed: number;
  readonly workers_failed: number;
  readonly verifier_pass_rate: number;
}

export function summarizeGlmNarutoWorkerMetrics(traces: readonly GlmNarutoWorkerTrace[]): GlmNarutoBenchMetrics {
  const ttft = traces.map((trace) => trace.ttft_ms).filter(isNumber).sort((a, b) => a - b);
  const totals = traces.map((trace) => trace.total_ms).filter(isNumber).sort((a, b) => a - b);
  const verifier = traces.filter((trace) => trace.status === 'verification_passed' || trace.status === 'verification_failed');
  const verifierPassed = verifier.filter((trace) => trace.status === 'verification_passed').length;

  return {
    p50_ttft_ms: percentile(ttft, 0.5),
    p90_ttft_ms: percentile(ttft, 0.9),
    p50_total_ms: percentile(totals, 0.5),
    p90_total_ms: percentile(totals, 0.9),
    cached_tokens_sum: sumNullable(traces.map((trace) => trace.cached_tokens ?? null)),
    cache_write_tokens_sum: sumNullable(traces.map((trace) => trace.cache_write_tokens ?? null)),
    reasoning_tokens_sum: sumNullable(traces.map((trace) => trace.reasoning_tokens ?? null)),
    workers_completed: traces.filter((trace) => trace.status === 'completed').length,
    workers_failed: traces.filter((trace) => trace.status === 'failed').length,
    verifier_pass_rate: verifier.length ? verifierPassed / verifier.length : 0
  };
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * quantile) - 1));
  return values[index] ?? null;
}

function sumNullable(values: readonly (number | null)[]): number | null {
  const present = values.filter(isNumber);
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

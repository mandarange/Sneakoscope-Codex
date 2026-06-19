import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import type { GlmBenchmarkCaseResult, GlmBenchModelLockProof } from './glm-benchmark-types.js';

export interface GlmBenchRequestSummaryProofInput {
  readonly requestSummaries?: readonly Record<string, unknown>[];
  readonly directTraceChecked?: boolean;
}

export function buildGlmBenchModelLockProof(
  cases: readonly GlmBenchmarkCaseResult[],
  proofInput: GlmBenchRequestSummaryProofInput = {}
): GlmBenchModelLockProof {
  const checkedCases = cases.map((c) => c.runner_id);
  const mismatches: string[] = [];
  const requestSummaries = proofInput.requestSummaries ?? [];
  let fallbackArraysFound = 0;
  let openaiKeyUsed = false;

  for (const caseResult of cases) {
    if (caseResult.model !== GLM_52_OPENROUTER_MODEL) {
      mismatches.push(`${caseResult.runner_id}: model is ${caseResult.model}, expected ${GLM_52_OPENROUTER_MODEL}`);
    }
    if (caseResult.gpt_fallback_allowed !== false) {
      mismatches.push(`${caseResult.runner_id}: gpt_fallback_allowed is not false`);
    }
  }

  for (const summary of requestSummaries) {
    if (summary.model !== undefined && summary.model !== GLM_52_OPENROUTER_MODEL) {
      mismatches.push(`request-summary:${String(summary.worker_id ?? summary.runner_id ?? 'unknown')}: model is ${String(summary.model)}`);
    }
    const models = Array.isArray(summary.models) ? summary.models : [];
    const fallbackModelsCount = typeof summary.fallback_models_count === 'number' ? summary.fallback_models_count : models.length;
    if (fallbackModelsCount > 0) fallbackArraysFound += 1;
    if (summary.openai_key_used === true || summary.authorization_source === 'openai') openaiKeyUsed = true;
    if (summary.gpt_fallback_allowed !== undefined && summary.gpt_fallback_allowed !== false) {
      mismatches.push(`request-summary:${String(summary.worker_id ?? summary.runner_id ?? 'unknown')}: gpt_fallback_allowed is not false`);
    }
  }

  if (fallbackArraysFound > 0) mismatches.push(`fallback_arrays_found:${fallbackArraysFound}`);
  if (openaiKeyUsed) mismatches.push('openai_key_used');

  const requestSummaryStatus = requestSummaries.length > 0 ? 'checked' : 'unavailable';
  return {
    schema: 'sks.glm-bench-model-lock-proof.v1',
    checked_cases: checkedCases,
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    request_summary_status: requestSummaryStatus,
    request_summaries_checked: requestSummaries.length,
    request_summaries_unavailable: Math.max(0, cases.length - requestSummaries.length),
    naruto_request_summaries_checked: requestSummaries.filter((summary) => String(summary.worker_id ?? '').startsWith('worker-')).length,
    direct_trace_checked: proofInput.directTraceChecked === true,
    fallback_arrays_found: fallbackArraysFound,
    openai_key_used: openaiKeyUsed,
    fallback_array_scan: requestSummaryStatus,
    openai_key_usage_scan: requestSummaryStatus,
    mismatches,
    passed: mismatches.length === 0
  };
}

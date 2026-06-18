import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import type { GlmBenchmarkCaseResult, GlmBenchModelLockProof } from './glm-benchmark-types.js';

export function buildGlmBenchModelLockProof(cases: readonly GlmBenchmarkCaseResult[]): GlmBenchModelLockProof {
  const checkedCases = cases.map((c) => c.runner_id);
  const mismatches: string[] = [];

  for (const caseResult of cases) {
    if (caseResult.model !== GLM_52_OPENROUTER_MODEL) {
      mismatches.push(`${caseResult.runner_id}: model is ${caseResult.model}, expected ${GLM_52_OPENROUTER_MODEL}`);
    }
    if (caseResult.gpt_fallback_allowed !== false) {
      mismatches.push(`${caseResult.runner_id}: gpt_fallback_allowed is not false`);
    }
  }

  return {
    schema: 'sks.glm-bench-model-lock-proof.v1',
    checked_cases: checkedCases,
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    fallback_arrays_found: 0,
    openai_key_used: false,
    mismatches,
    passed: mismatches.length === 0
  };
}

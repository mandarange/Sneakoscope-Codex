export interface GlmNarutoUsageMetrics {
  readonly prompt_tokens: number | null;
  readonly completion_tokens: number | null;
  readonly reasoning_tokens: number | null;
  readonly cached_tokens: number | null;
  readonly cache_write_tokens: number | null;
}

export function extractGlmNarutoUsageMetrics(usage: unknown): GlmNarutoUsageMetrics {
  const object = usage && typeof usage === 'object' ? usage as Record<string, unknown> : {};
  const promptDetails = object.prompt_tokens_details && typeof object.prompt_tokens_details === 'object'
    ? object.prompt_tokens_details as Record<string, unknown>
    : {};
  const completionDetails = object.completion_tokens_details && typeof object.completion_tokens_details === 'object'
    ? object.completion_tokens_details as Record<string, unknown>
    : {};

  return {
    prompt_tokens: numberOrNull(object.prompt_tokens),
    completion_tokens: numberOrNull(object.completion_tokens),
    reasoning_tokens: firstNumber([
      completionDetails.reasoning_tokens,
      object.reasoning_tokens
    ]),
    cached_tokens: numberOrNull(promptDetails.cached_tokens),
    cache_write_tokens: numberOrNull(promptDetails.cache_write_tokens)
  };
}

function firstNumber(values: readonly unknown[]): number | null {
  for (const value of values) {
    const numeric = numberOrNull(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

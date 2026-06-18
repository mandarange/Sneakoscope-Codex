export const GLM_SPEED_CONTEXT_TARGET_TOKENS = 16_000;
export const GLM_SPEED_CONTEXT_HARD_CAP_TOKENS = 32_000;
export const GLM_DEEP_CONTEXT_TARGET_TOKENS = 64_000;

export function estimateGlmTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function trimToEstimatedTokens(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, Math.floor(maxTokens) * 4);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

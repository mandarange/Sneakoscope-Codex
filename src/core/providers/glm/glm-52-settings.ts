export { OPENROUTER_CHAT_COMPLETIONS_URL } from '../openrouter/openrouter-types.js';

export const GLM_52_OPENROUTER_MODEL = 'z-ai/glm-5.2' as const;
export const GLM_MAD_MODE = 'mad-glm' as const;

export const GLM_52_MAX_TOKENS_DEFAULT = 32768;
export const GLM_52_MAX_TOKENS_LONG = 65536;
export const GLM_52_MAX_TOKENS_XLONG = 131072;
export const GLM_52_TOP_PROVIDER_MAX_COMPLETION_TOKENS = 262144;

export const GLM_52_DEFAULT_REQUEST_SETTINGS = {
  model: GLM_52_OPENROUTER_MODEL,
  temperature: 1,
  top_p: 0.95,
  reasoning_effort: 'high',
  stream: true,
  provider: {
    allow_fallbacks: false,
    require_parameters: true
  },
  tool_choice: 'auto',
  parallel_tool_calls: false,
  max_tokens: GLM_52_MAX_TOKENS_DEFAULT
} as const;

export type Glm52ReasoningEffort = 'high' | 'xhigh';

export function clampGlm52MaxTokens(value: number | null | undefined): number {
  const numeric = Number.isFinite(value) ? Math.floor(Number(value)) : GLM_52_MAX_TOKENS_DEFAULT;
  return Math.max(1, Math.min(numeric, GLM_52_TOP_PROVIDER_MAX_COMPLETION_TOKENS));
}

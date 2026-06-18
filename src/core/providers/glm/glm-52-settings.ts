export { OPENROUTER_CHAT_COMPLETIONS_URL } from '../openrouter/openrouter-types.js';

export const GLM_52_OPENROUTER_MODEL = 'z-ai/glm-5.2' as const;
export const GLM_52_MODEL = GLM_52_OPENROUTER_MODEL;
export const GLM_SPEED_MODE = 'mad-glm-speed' as const;
export const GLM_DEEP_MODE = 'mad-glm-deep' as const;
export const GLM_XHIGH_MODE = 'mad-glm-xhigh' as const;
export const GLM_STRICT_MODE = 'mad-glm-strict' as const;
export const GLM_MAD_MODE = GLM_SPEED_MODE;

export const GLM_52_MAX_TOKENS_SPEED = 4096;
export const GLM_52_MAX_TOKENS_DEFAULT = GLM_52_MAX_TOKENS_SPEED;
export const GLM_52_MAX_TOKENS_DEEP = 16384;
export const GLM_52_MAX_TOKENS_XHIGH = 32768;
export const GLM_52_MAX_TOKENS_LONG = 65536;
export const GLM_52_MAX_TOKENS_XLONG = 131072;
export const GLM_52_TOP_PROVIDER_MAX_COMPLETION_TOKENS = 262144;

export const GLM_SPEED_PROFILE = {
  model: GLM_52_OPENROUTER_MODEL,
  mode: GLM_SPEED_MODE,
  temperature: 0.2,
  top_p: 0.85,
  stream: true,
  provider: {
    allow_fallbacks: false,
    require_parameters: false,
    sort: 'throughput',
    preferred_min_throughput: { p50: 80, p90: 40 },
    preferred_max_latency: { p50: 2, p90: 5 }
  },
  tool_choice: 'none',
  parallel_tool_calls: false,
  max_tokens: GLM_52_MAX_TOKENS_SPEED,
  reasoning_effort: null,
  reasoning_default: 'off-or-minimal-speed'
} as const;

export const GLM_DEEP_PROFILE = {
  model: GLM_52_OPENROUTER_MODEL,
  mode: GLM_DEEP_MODE,
  temperature: 0.3,
  top_p: 0.9,
  stream: true,
  provider: {
    allow_fallbacks: false,
    require_parameters: true,
    sort: 'throughput'
  },
  tool_choice: 'auto',
  parallel_tool_calls: false,
  max_tokens: GLM_52_MAX_TOKENS_DEEP,
  reasoning_effort: 'high'
} as const;

export const GLM_XHIGH_PROFILE = {
  ...GLM_DEEP_PROFILE,
  mode: GLM_XHIGH_MODE,
  max_tokens: GLM_52_MAX_TOKENS_XHIGH,
  reasoning_effort: 'xhigh'
} as const;

export const GLM_STRICT_PROFILE = {
  ...GLM_DEEP_PROFILE,
  mode: GLM_STRICT_MODE,
  structured_outputs: true,
  response_format: 'json_schema'
} as const;

export const GLM_52_DEFAULT_REQUEST_SETTINGS = GLM_SPEED_PROFILE;

export type Glm52ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type GlmProfileName = 'speed' | 'deep' | 'xhigh' | 'strict';
export type GlmModeId =
  | typeof GLM_SPEED_MODE
  | typeof GLM_DEEP_MODE
  | typeof GLM_XHIGH_MODE
  | typeof GLM_STRICT_MODE;

export function clampGlm52MaxTokens(value: number | null | undefined): number {
  const numeric = Number.isFinite(value) ? Math.floor(Number(value)) : GLM_52_MAX_TOKENS_DEFAULT;
  return Math.max(1, Math.min(numeric, GLM_52_TOP_PROVIDER_MAX_COMPLETION_TOKENS));
}

/** Codex Desktop OpenRouter provider constants (Center / glm-profile install). */

export const OPENROUTER_PROVIDER_ID = 'openrouter' as const;
export const OPENROUTER_DEFAULT_MODEL = 'z-ai/glm-5.2' as const;
export const OPENROUTER_DEFAULT_PROFILE_ID = 'sks-openrouter-default' as const;
export const OPENROUTER_DEFAULT_PROFILE_LABEL = 'OpenRouter (SKS)' as const;

/** @deprecated Prefer OPENROUTER_DEFAULT_MODEL — kept for existing Codex profile ids. */
export const GLM_52_OPENROUTER_MODEL = OPENROUTER_DEFAULT_MODEL;
/** @deprecated Prefer OPENROUTER_PROVIDER_ID */
export const GLM_CODEX_CONFIG_PROVIDER_ID = OPENROUTER_PROVIDER_ID;
/** @deprecated Prefer OPENROUTER_DEFAULT_PROFILE_ID — legacy MAD profile id still written for Desktop picker. */
export const GLM_CODEX_CONFIG_PROFILE_ID = 'sks-glm-52-mad' as const;
/** @deprecated */
export const GLM_CODEX_APP_PROFILE_ID = 'sks/glm-5.2-mad' as const;
/** @deprecated */
export const GLM_CODEX_APP_PROFILE_LABEL = 'GLM 5.2 (OpenRouter)' as const;

export type OpenRouterReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
/** @deprecated */
export type Glm52ReasoningEffort = OpenRouterReasoningEffort;

export interface OpenRouterCodexReasoningProfile {
  readonly id: string;
  readonly label: string;
  readonly reasoning_effort: OpenRouterReasoningEffort;
}

/** @deprecated */
export type GlmCodexConfigReasoningProfile = OpenRouterCodexReasoningProfile;

export const OPENROUTER_SELECTABLE_REASONING_EFFORTS: readonly OpenRouterReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;

/** @deprecated */
export const GLM_CODEX_SELECTABLE_REASONING_EFFORTS = OPENROUTER_SELECTABLE_REASONING_EFFORTS;

export const OPENROUTER_CODEX_REASONING_PROFILES: readonly OpenRouterCodexReasoningProfile[] = [
  { id: GLM_CODEX_CONFIG_PROFILE_ID, label: 'GLM 5.2 default', reasoning_effort: 'none' },
  { id: 'sks-glm-52-minimal', label: 'GLM 5.2 Minimal', reasoning_effort: 'minimal' },
  { id: 'sks-glm-52-low', label: 'GLM 5.2 Low', reasoning_effort: 'low' },
  { id: 'sks-glm-52-medium', label: 'GLM 5.2 Medium', reasoning_effort: 'medium' },
  { id: 'sks-glm-52-high', label: 'GLM 5.2 High', reasoning_effort: 'high' },
  { id: 'sks-glm-52-xhigh', label: 'GLM 5.2 XHigh', reasoning_effort: 'xhigh' },
] as const;

/** @deprecated */
export const GLM_CODEX_CONFIG_REASONING_PROFILES = OPENROUTER_CODEX_REASONING_PROFILES;

export interface SksCodexAppModelProfile {
  readonly schema: 'sks.codex-app-model-profile.v1';
  readonly id: typeof GLM_CODEX_APP_PROFILE_ID;
  readonly label: typeof GLM_CODEX_APP_PROFILE_LABEL;
  readonly provider: 'openrouter';
  readonly model: typeof OPENROUTER_DEFAULT_MODEL;
  readonly codexConfigProvider: typeof OPENROUTER_PROVIDER_ID;
  readonly codexConfigProfile: typeof GLM_CODEX_CONFIG_PROFILE_ID;
  readonly supportedReasoningEfforts: readonly OpenRouterReasoningEffort[];
  readonly reasoningProfiles: readonly OpenRouterCodexReasoningProfile[];
  readonly mode: 'openrouter-desktop';
  readonly strictModelLock: false;
  readonly gptFallbackAllowed: false;
  readonly requiresSecret: 'openrouter-api-key';
  readonly defaultProfile: 'speed';
  readonly defaultSettings: {
    readonly temperature: number;
    readonly top_p: number;
    readonly reasoning_effort: OpenRouterReasoningEffort | null;
    readonly tool_choice: 'none' | 'auto';
    readonly parallel_tool_calls: false;
    readonly max_tokens: number;
    readonly provider_sort: 'throughput' | 'latency' | 'price';
    readonly provider_allow_fallbacks: false;
    readonly provider_require_parameters: boolean;
  };
  readonly codexCompatibility: {
    readonly target: 'rust-v0.145.0';
    readonly selectedExecutorPluginMcp: 'defer-to-codex-native';
    readonly duplicateAppMcpDeclarations: 'dedupe-by-codex';
    readonly cwdShellPathSemantics: 'preserve-codex-native';
  };
}

export function buildGlmCodexAppModelProfile(): SksCodexAppModelProfile {
  return {
    schema: 'sks.codex-app-model-profile.v1',
    id: GLM_CODEX_APP_PROFILE_ID,
    label: GLM_CODEX_APP_PROFILE_LABEL,
    provider: 'openrouter',
    model: OPENROUTER_DEFAULT_MODEL,
    codexConfigProvider: OPENROUTER_PROVIDER_ID,
    codexConfigProfile: GLM_CODEX_CONFIG_PROFILE_ID,
    supportedReasoningEfforts: OPENROUTER_SELECTABLE_REASONING_EFFORTS,
    reasoningProfiles: OPENROUTER_CODEX_REASONING_PROFILES,
    mode: 'openrouter-desktop',
    strictModelLock: false,
    gptFallbackAllowed: false,
    requiresSecret: 'openrouter-api-key',
    defaultProfile: 'speed',
    defaultSettings: {
      temperature: 0.2,
      top_p: 0.85,
      reasoning_effort: null,
      tool_choice: 'none',
      parallel_tool_calls: false,
      max_tokens: 4096,
      provider_sort: 'throughput',
      provider_allow_fallbacks: false,
      provider_require_parameters: false,
    },
    codexCompatibility: {
      target: 'rust-v0.145.0',
      selectedExecutorPluginMcp: 'defer-to-codex-native',
      duplicateAppMcpDeclarations: 'dedupe-by-codex',
      cwdShellPathSemantics: 'preserve-codex-native',
    },
  };
}

export function normalizeOpenRouterModelId(value: unknown): string | null {
  const model = String(value || '').trim();
  if (!model) return null;
  if (model.length > 200) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) return null;
  return model;
}

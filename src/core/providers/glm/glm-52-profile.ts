import {
  GLM_52_OPENROUTER_MODEL,
  GLM_MAD_MODE,
  type Glm52ReasoningEffort
} from './glm-52-settings.js';
import { profileFromConst } from './glm-profile-resolver.js';

export const GLM_CODEX_APP_PROFILE_ID = 'sks/glm-5.2-mad' as const;
export const GLM_CODEX_APP_PROFILE_LABEL = 'GLM 5.2 (MAD Speed / OpenRouter)' as const;
export const GLM_CODEX_CONFIG_PROVIDER_ID = 'openrouter' as const;
export const GLM_CODEX_CONFIG_PROFILE_ID = 'sks-glm-52-mad' as const;

export interface GlmCodexConfigReasoningProfile {
  readonly id: string;
  readonly label: string;
  readonly reasoning_effort: Glm52ReasoningEffort;
}

export const GLM_CODEX_SELECTABLE_REASONING_EFFORTS: readonly Glm52ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;

export const GLM_CODEX_CONFIG_REASONING_PROFILES: readonly GlmCodexConfigReasoningProfile[] = [
  {
    id: GLM_CODEX_CONFIG_PROFILE_ID,
    label: 'GLM 5.2 MAD Speed',
    reasoning_effort: 'none',
  },
  {
    id: 'sks-glm-52-minimal',
    label: 'GLM 5.2 Minimal',
    reasoning_effort: 'minimal',
  },
  {
    id: 'sks-glm-52-low',
    label: 'GLM 5.2 Low',
    reasoning_effort: 'low',
  },
  {
    id: 'sks-glm-52-medium',
    label: 'GLM 5.2 Medium',
    reasoning_effort: 'medium',
  },
  {
    id: 'sks-glm-52-high',
    label: 'GLM 5.2 High',
    reasoning_effort: 'high',
  },
  {
    id: 'sks-glm-52-xhigh',
    label: 'GLM 5.2 XHigh',
    reasoning_effort: 'xhigh',
  },
] as const;

export interface SksCodexAppModelProfile {
  readonly schema: 'sks.codex-app-model-profile.v1';
  readonly id: typeof GLM_CODEX_APP_PROFILE_ID;
  readonly label: typeof GLM_CODEX_APP_PROFILE_LABEL;
  readonly provider: 'openrouter';
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly codexConfigProvider: typeof GLM_CODEX_CONFIG_PROVIDER_ID;
  readonly codexConfigProfile: typeof GLM_CODEX_CONFIG_PROFILE_ID;
  readonly supportedReasoningEfforts: readonly Glm52ReasoningEffort[];
  readonly reasoningProfiles: readonly GlmCodexConfigReasoningProfile[];
  readonly mode: typeof GLM_MAD_MODE;
  readonly strictModelLock: true;
  readonly gptFallbackAllowed: false;
  readonly requiresSecret: 'openrouter-api-key';
  readonly defaultProfile: 'speed';
  readonly defaultSettings: {
    readonly temperature: number;
    readonly top_p: number;
    readonly reasoning_effort: 'high' | 'xhigh' | null;
    readonly tool_choice: 'none' | 'auto';
    readonly parallel_tool_calls: false;
    readonly max_tokens: number;
    readonly provider_sort: 'throughput' | 'latency' | 'price';
    readonly provider_allow_fallbacks: false;
    readonly provider_require_parameters: boolean;
  };
  readonly codexCompatibility: {
    readonly target: 'rust-v0.141.0';
    readonly selectedExecutorPluginMcp: 'defer-to-codex-native';
    readonly duplicateAppMcpDeclarations: 'dedupe-by-codex';
    readonly cwdShellPathSemantics: 'preserve-codex-native';
  };
}

export function buildGlmCodexAppModelProfile(): SksCodexAppModelProfile {
  const speed = profileFromConst('speed');
  return {
    schema: 'sks.codex-app-model-profile.v1',
    id: GLM_CODEX_APP_PROFILE_ID,
    label: GLM_CODEX_APP_PROFILE_LABEL,
    provider: 'openrouter',
    model: GLM_52_OPENROUTER_MODEL,
    codexConfigProvider: GLM_CODEX_CONFIG_PROVIDER_ID,
    codexConfigProfile: GLM_CODEX_CONFIG_PROFILE_ID,
    supportedReasoningEfforts: GLM_CODEX_SELECTABLE_REASONING_EFFORTS,
    reasoningProfiles: GLM_CODEX_CONFIG_REASONING_PROFILES,
    mode: GLM_MAD_MODE,
    strictModelLock: true,
    gptFallbackAllowed: false,
    requiresSecret: 'openrouter-api-key',
    defaultProfile: 'speed',
    defaultSettings: {
      temperature: speed.temperature,
      top_p: speed.top_p,
      reasoning_effort: speed.reasoning_effort || null,
      tool_choice: speed.tool_choice,
      parallel_tool_calls: speed.parallel_tool_calls,
      max_tokens: speed.max_tokens,
      provider_sort: speed.provider.sort || 'throughput',
      provider_allow_fallbacks: false,
      provider_require_parameters: speed.provider.require_parameters
    },
    codexCompatibility: {
      target: 'rust-v0.141.0',
      selectedExecutorPluginMcp: 'defer-to-codex-native',
      duplicateAppMcpDeclarations: 'dedupe-by-codex',
      cwdShellPathSemantics: 'preserve-codex-native'
    }
  };
}

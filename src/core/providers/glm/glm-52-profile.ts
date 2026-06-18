import {
  GLM_52_OPENROUTER_MODEL,
  GLM_MAD_MODE
} from './glm-52-settings.js';
import { profileFromConst } from './glm-profile-resolver.js';

export const GLM_CODEX_APP_PROFILE_ID = 'sks/glm-5.2-mad' as const;
export const GLM_CODEX_APP_PROFILE_LABEL = 'GLM 5.2 (MAD Speed / OpenRouter)' as const;

export interface SksCodexAppModelProfile {
  readonly schema: 'sks.codex-app-model-profile.v1';
  readonly id: typeof GLM_CODEX_APP_PROFILE_ID;
  readonly label: typeof GLM_CODEX_APP_PROFILE_LABEL;
  readonly provider: 'openrouter';
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
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

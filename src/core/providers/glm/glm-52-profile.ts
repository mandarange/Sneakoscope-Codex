import {
  GLM_52_DEFAULT_REQUEST_SETTINGS,
  GLM_52_OPENROUTER_MODEL,
  GLM_MAD_MODE
} from './glm-52-settings.js';

export const GLM_CODEX_APP_PROFILE_ID = 'sks/glm-5.2-mad' as const;
export const GLM_CODEX_APP_PROFILE_LABEL = 'GLM 5.2 (MAD / OpenRouter)' as const;

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
  readonly defaultSettings: {
    readonly temperature: 1;
    readonly top_p: 0.95;
    readonly reasoning_effort: 'high';
    readonly tool_choice: 'auto';
    readonly parallel_tool_calls: false;
  };
  readonly codexCompatibility: {
    readonly target: 'rust-v0.141.0';
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
    model: GLM_52_OPENROUTER_MODEL,
    mode: GLM_MAD_MODE,
    strictModelLock: true,
    gptFallbackAllowed: false,
    requiresSecret: 'openrouter-api-key',
    defaultSettings: {
      temperature: GLM_52_DEFAULT_REQUEST_SETTINGS.temperature,
      top_p: GLM_52_DEFAULT_REQUEST_SETTINGS.top_p,
      reasoning_effort: 'high',
      tool_choice: 'auto',
      parallel_tool_calls: false
    },
    codexCompatibility: {
      target: 'rust-v0.141.0',
      selectedExecutorPluginMcp: 'defer-to-codex-native',
      duplicateAppMcpDeclarations: 'dedupe-by-codex',
      cwdShellPathSemantics: 'preserve-codex-native'
    }
  };
}

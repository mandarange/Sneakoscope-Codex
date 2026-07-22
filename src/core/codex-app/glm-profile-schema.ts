import {
  OPENROUTER_DEFAULT_PROFILE_ID,
  OPENROUTER_PROVIDER_ID,
  GLM_CODEX_SELECTABLE_REASONING_EFFORTS,
  GLM_CODEX_CONFIG_REASONING_PROFILES,
  GLM_52_OPENROUTER_MODEL,
  buildGlmCodexAppModelProfile,
  type SksCodexAppModelProfile
} from './openrouter-provider.js';

export function validateGlmCodexAppModelProfile(value: unknown): {
  readonly ok: boolean;
  readonly blockers: readonly string[];
  readonly profile: SksCodexAppModelProfile | null;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, blockers: ['glm_codex_app_profile_missing'], profile: null };
  }
  const profile = value as Partial<SksCodexAppModelProfile>;
  const expected = buildGlmCodexAppModelProfile();
  const blockers = [
    profile.schema === expected.schema ? null : 'glm_codex_app_profile_invalid_schema',
    profile.id === OPENROUTER_DEFAULT_PROFILE_ID ? null : 'glm_codex_app_profile_invalid_id',
    profile.provider === 'openrouter' ? null : 'glm_codex_app_profile_invalid_provider',
    profile.model === GLM_52_OPENROUTER_MODEL ? null : 'glm_codex_app_profile_invalid_model',
    profile.codexConfigProvider === OPENROUTER_PROVIDER_ID ? null : 'glm_codex_app_profile_invalid_codex_config_provider',
    profile.codexConfigProfile === OPENROUTER_DEFAULT_PROFILE_ID ? null : 'glm_codex_app_profile_invalid_codex_config_profile',
    hasExpectedReasoningEfforts(profile.supportedReasoningEfforts) ? null : 'glm_codex_app_profile_invalid_reasoning_efforts',
    hasExpectedReasoningProfiles(profile.reasoningProfiles) ? null : 'glm_codex_app_profile_invalid_reasoning_profiles',
    profile.mode === 'openrouter-desktop' ? null : 'glm_codex_app_profile_invalid_mode',
    profile.strictModelLock === false ? null : 'glm_codex_app_profile_unexpected_strict_lock',
    profile.gptFallbackAllowed === false ? null : 'glm_codex_app_profile_allows_gpt_fallback',
    profile.defaultProfile === 'speed' ? null : 'glm_codex_app_profile_default_not_speed',
    profile.defaultSettings?.tool_choice === 'none' ? null : 'glm_codex_app_profile_default_tools_not_omitted',
    profile.defaultSettings?.provider_require_parameters === false ? null : 'glm_codex_app_profile_default_requires_parameters',
    profile.defaultSettings?.provider_allow_fallbacks === false ? null : 'glm_codex_app_profile_allows_provider_fallback'
  ].filter((item): item is string => Boolean(item));
  return {
    ok: blockers.length === 0,
    blockers,
    profile: blockers.length === 0 ? profile as SksCodexAppModelProfile : null
  };
}

function hasExpectedReasoningEfforts(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return GLM_CODEX_SELECTABLE_REASONING_EFFORTS.every((effort) => value.includes(effort));
}

function hasExpectedReasoningProfiles(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  // Desktop reasoning profile tables are retired; metadata must stay empty.
  return value.length === 0 && GLM_CODEX_CONFIG_REASONING_PROFILES.length === 0;
}

import {
  GLM_CODEX_APP_PROFILE_ID,
  buildGlmCodexAppModelProfile,
  type SksCodexAppModelProfile
} from './glm-model-profile.js';
import { GLM_52_OPENROUTER_MODEL, GLM_MAD_MODE } from '../providers/glm/glm-52-settings.js';

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
    profile.id === GLM_CODEX_APP_PROFILE_ID ? null : 'glm_codex_app_profile_invalid_id',
    profile.provider === 'openrouter' ? null : 'glm_codex_app_profile_invalid_provider',
    profile.model === GLM_52_OPENROUTER_MODEL ? null : 'glm_codex_app_profile_invalid_model',
    profile.mode === GLM_MAD_MODE ? null : 'glm_codex_app_profile_invalid_mode',
    profile.strictModelLock === true ? null : 'glm_codex_app_profile_not_strict',
    profile.gptFallbackAllowed === false ? null : 'glm_codex_app_profile_allows_gpt_fallback'
  ].filter((item): item is string => Boolean(item));
  return {
    ok: blockers.length === 0,
    blockers,
    profile: blockers.length === 0 ? profile as SksCodexAppModelProfile : null
  };
}

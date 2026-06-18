import { GLM_52_OPENROUTER_MODEL } from './glm-52-settings.js';

export type GlmModelGuardCode =
  | 'ok'
  | 'glm_model_missing'
  | 'glm_model_mismatch';

export interface GlmModelGuardResult {
  readonly ok: boolean;
  readonly code: GlmModelGuardCode;
  readonly actualModel?: string;
  readonly requestedModel: typeof GLM_52_OPENROUTER_MODEL;
  readonly strictModelLock: true;
  readonly gptFallbackAllowed: false;
}

export function assertGlm52ActualModel(responseModel: string | undefined): GlmModelGuardResult {
  if (!responseModel) {
    return {
      ok: false,
      code: 'glm_model_missing',
      requestedModel: GLM_52_OPENROUTER_MODEL,
      strictModelLock: true,
      gptFallbackAllowed: false
    };
  }

  const normalized = responseModel.toLowerCase();
  if (
    normalized === GLM_52_OPENROUTER_MODEL ||
    normalized.startsWith(`${GLM_52_OPENROUTER_MODEL}-`) ||
    normalized.includes('glm-5.2')
  ) {
    return {
      ok: true,
      code: 'ok',
      actualModel: responseModel,
      requestedModel: GLM_52_OPENROUTER_MODEL,
      strictModelLock: true,
      gptFallbackAllowed: false
    };
  }

  return {
    ok: false,
    code: 'glm_model_mismatch',
    actualModel: responseModel,
    requestedModel: GLM_52_OPENROUTER_MODEL,
    strictModelLock: true,
    gptFallbackAllowed: false
  };
}

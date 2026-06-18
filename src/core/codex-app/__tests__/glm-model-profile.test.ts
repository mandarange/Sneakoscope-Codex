import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmCodexAppModelProfile } from '../glm-model-profile.js';
import { validateGlmCodexAppModelProfile } from '../glm-profile-schema.js';

test('Codex App GLM profile locks OpenRouter GLM 5.2 with no GPT fallback', () => {
  const profile = buildGlmCodexAppModelProfile();
  assert.equal(profile.id, 'sks/glm-5.2-mad');
  assert.equal(profile.label, 'GLM 5.2 (MAD / OpenRouter)');
  assert.equal(profile.provider, 'openrouter');
  assert.equal(profile.model, 'z-ai/glm-5.2');
  assert.equal(profile.strictModelLock, true);
  assert.equal(profile.gptFallbackAllowed, false);
  assert.equal(validateGlmCodexAppModelProfile(profile).ok, true);
});

test('Codex App GLM profile validator rejects GPT fallback', () => {
  const profile = { ...buildGlmCodexAppModelProfile(), gptFallbackAllowed: true };
  const validation = validateGlmCodexAppModelProfile(profile);
  assert.equal(validation.ok, false);
  assert.equal(validation.blockers.includes('glm_codex_app_profile_allows_gpt_fallback'), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmCodexAppModelProfile } from '../glm-model-profile.js';
import { validateGlmCodexAppModelProfile } from '../glm-profile-schema.js';

test('Codex App OpenRouter profile metadata defaults without Desktop GLM picker profiles', () => {
  const profile = buildGlmCodexAppModelProfile();
  assert.equal(profile.provider, 'openrouter');
  assert.equal(profile.label, 'OpenRouter (SKS)');
  assert.equal(profile.model, 'z-ai/glm-5.2');
  assert.equal(profile.codexConfigProvider, 'openrouter');
  assert.equal(profile.codexConfigProfile, 'sks-openrouter-default');
  assert.equal(profile.id, 'sks-openrouter-default');
  assert.deepEqual(profile.reasoningProfiles, []);
  assert.equal(profile.gptFallbackAllowed, false);
  assert.equal(validateGlmCodexAppModelProfile(profile).ok, true);
});

test('Codex App GLM profile validator rejects GPT fallback', () => {
  const profile = {
    ...buildGlmCodexAppModelProfile(),
    gptFallbackAllowed: true
  };
  const result = validateGlmCodexAppModelProfile(profile);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('glm_codex_app_profile_allows_gpt_fallback'));
});

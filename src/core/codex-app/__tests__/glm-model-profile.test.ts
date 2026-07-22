import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmCodexAppModelProfile } from '../glm-model-profile.js';
import { validateGlmCodexAppModelProfile } from '../glm-profile-schema.js';

test('Codex App OpenRouter profile defaults GLM 5.2 with no GPT fallback', () => {
  const profile = buildGlmCodexAppModelProfile();
  assert.equal(profile.id, 'sks/glm-5.2-mad');
  assert.equal(profile.label, 'GLM 5.2 (OpenRouter)');
  assert.equal(profile.provider, 'openrouter');
  assert.equal(profile.model, 'z-ai/glm-5.2');
  assert.equal(profile.codexConfigProvider, 'openrouter');
  assert.equal(profile.codexConfigProfile, 'sks-glm-52-mad');
  assert.equal(profile.mode, 'openrouter-desktop');
  assert.deepEqual(profile.supportedReasoningEfforts, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
  assert.equal(profile.reasoningProfiles.some((item) => item.id === 'sks-glm-52-high' && item.reasoning_effort === 'high'), true);
  assert.equal(profile.reasoningProfiles.some((item) => item.id === 'sks-glm-52-xhigh' && item.reasoning_effort === 'xhigh'), true);
  assert.equal(profile.defaultProfile, 'speed');
  assert.equal(profile.defaultSettings.reasoning_effort, null);
  assert.equal(profile.defaultSettings.tool_choice, 'none');
  assert.equal(profile.defaultSettings.provider_require_parameters, false);
  assert.equal(profile.strictModelLock, false);
  assert.equal(profile.gptFallbackAllowed, false);
  assert.equal(validateGlmCodexAppModelProfile(profile).ok, true);
});

test('Codex App GLM profile validator rejects GPT fallback', () => {
  const profile = { ...buildGlmCodexAppModelProfile(), gptFallbackAllowed: true };
  const validation = validateGlmCodexAppModelProfile(profile);
  assert.equal(validation.ok, false);
  assert.equal(validation.blockers.includes('glm_codex_app_profile_allows_gpt_fallback'), true);
});

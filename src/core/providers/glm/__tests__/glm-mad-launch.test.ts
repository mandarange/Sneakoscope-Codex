import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMadGlmCodexWrapperScript,
  buildMadGlmLaunchProfileNoWrite
} from '../glm-mad-launch.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { resolveMadNativeSwarmOptions } from '../../../commands/mad-sks-command.js';

test('GLM MAD launch profile targets OpenRouter GLM without codex-lb or OpenAI fallback', () => {
  const profile = buildMadGlmLaunchProfileNoWrite();
  const joined = profile.launch_args.join('\n');

  assert.equal(profile.profile_name, 'sks/glm-5.2-mad');
  assert.equal(profile.provider, 'openrouter');
  assert.equal(profile.model, GLM_52_OPENROUTER_MODEL);
  assert.equal(profile.glm_profile, 'speed');
  assert.equal(profile.model_reasoning_effort, 'low');
  assert.equal(profile.gpt_fallback_allowed, false);
  assert.deepEqual(profile.blockers, []);
  assert.match(joined, /model_provider="openrouter"/);
  assert.match(joined, new RegExp(`model="${GLM_52_OPENROUTER_MODEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(joined, /model_providers\.openrouter\.env_key="OPENROUTER_API_KEY"/);
  assert.doesNotMatch(joined, /codex-lb|model_provider="openai"/);
  assert.doesNotMatch(joined, /model_reasoning_effort=(high|xhigh)/);
});

test('GLM MAD launch profile escalates reasoning only for explicit profiles', () => {
  assert.equal(buildMadGlmLaunchProfileNoWrite(['--deep']).model_reasoning_effort, 'high');
  assert.equal(buildMadGlmLaunchProfileNoWrite(['--xhigh']).model_reasoning_effort, 'xhigh');
  assert.equal(buildMadGlmLaunchProfileNoWrite(['/model', 'high']).model_reasoning_effort, 'high');
  assert.equal(buildMadGlmLaunchProfileNoWrite(['/model', 'z-ai/glm-5.2', 'xhigh']).model_reasoning_effort, 'xhigh');
  assert.equal(buildMadGlmLaunchProfileNoWrite().model_reasoning_effort, 'low');
  assert.equal(buildMadGlmLaunchProfileNoWrite(['--strict']).glm_profile, 'strict');
});

test('GLM MAD slash model selector keeps the model lock strict', () => {
  const blocked = buildMadGlmLaunchProfileNoWrite(['/model', 'gpt-5.6-terra', 'high']);
  assert.equal(blocked.glm_profile, 'deep');
  assert.deepEqual(blocked.blockers, ['glm_slash_model_mismatch:gpt-5.6-terra']);
  assert.deepEqual(blocked.launch_args.filter((arg) => arg.includes('model=')
    || arg.startsWith('model_reasoning_effort=')), [
    'model_reasoning_effort=high',
    `model="${GLM_52_OPENROUTER_MODEL}"`
  ]);
});

test('GLM MAD wrapper reads stored key at runtime without embedding raw OpenRouter secret', () => {
  const script = buildMadGlmCodexWrapperScript({
    realCodexBin: 'codex',
    secretKeyPath: '/Users/example/.sneakoscope/secrets/openrouter-api-key'
  });

  assert.match(script, /OPENROUTER_API_KEY/);
  assert.match(script, /openrouter-api-key/);
  assert.match(script, /exec 'codex' "\$@"/);
  assert.doesNotMatch(script, /sk-or-/);
});

test('GLM MAD blocks explicitly requested native swarm to prevent GPT fallback panes', () => {
  const swarm = resolveMadNativeSwarmOptions(['--glm', '--mad-native-swarm'], {}, {
    glmLaunch: { provider: 'openrouter', model: GLM_52_OPENROUTER_MODEL }
  });

  assert.equal(swarm.enabled, false);
  assert.equal(swarm.disabled_reason, 'glm_mad_native_swarm_disabled_to_block_gpt_fallback');
});

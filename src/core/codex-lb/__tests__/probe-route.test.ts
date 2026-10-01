import test from 'node:test';
import assert from 'node:assert/strict';
import type { BridgeRouteTarget } from '../bridge-contracts.js';
import { probeRouteForProvider } from '../desktop-controller-v3/probe-route.js';

const route = (provider_id: string, upstream_model: string) => ({ provider_id, upstream_model }) as unknown as BridgeRouteTarget;

// Route policies list models alphabetically, as the live bridge writes them.
const policy = {
  model_routes: {
    'codex-auto-review': route('codex-lb', 'codex-auto-review'),
    'codex-lb:codex-auto-review': route('codex-lb', 'codex-auto-review'),
    'deepseek/deepseek-v4.1-flash': route('openrouter', 'deepseek/deepseek-v4.1-flash'),
    'gpt-5.5': route('codex-lb', 'gpt-5.5'),
    'gpt-5.6-sol': route('codex-lb', 'gpt-5.6-sol'),
    'gpt-6-astra': route('codex-lb', 'gpt-6-astra'),
    'gpt-6-sol': route('codex-lb', 'gpt-6-sol'),
    'gpt-6.1-sol': route('codex-lb', 'gpt-6.1-sol'),
    'z-ai/glm-5.3': route('openrouter', 'z-ai/glm-5.3')
  }
};

test('the live probe exercises the newest generation the provider serves, not the alphabetically first route', () => {
  assert.equal(probeRouteForProvider(policy, 'codex-lb')?.[0], 'gpt-6.1-sol');
});

test('at an equal version the balanced family wins, and providers without gpt ids keep their first route', () => {
  const tied = { model_routes: { 'gpt-6-astra': route('codex-lb', 'gpt-6-astra'), 'gpt-6-luna': route('codex-lb', 'gpt-6-luna'), 'gpt-6-sol': route('codex-lb', 'gpt-6-sol') } };
  assert.equal(probeRouteForProvider(tied, 'codex-lb')?.[0], 'gpt-6-sol');
  assert.equal(probeRouteForProvider(policy, 'openrouter')?.[0], 'deepseek/deepseek-v4.1-flash');
});

test('a provider with no routes, or no policy, has no probe route', () => {
  assert.equal(probeRouteForProvider({ model_routes: {} }, 'codex-lb'), null);
  assert.equal(probeRouteForProvider(null, 'codex-lb'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeepReasoningConfig, buildFastReasoningConfig } from '../glm-reasoning-policy.js';

test('fast reasoning policy never defaults to high or xhigh', () => {
  assert.deepEqual(buildFastReasoningConfig({ supported_efforts: ['high', 'xhigh'] }), { exclude: true });
  assert.deepEqual(buildFastReasoningConfig({ supported_efforts: ['minimal', 'high'] }), { effort: 'minimal', exclude: true });
  assert.deepEqual(buildFastReasoningConfig({ supported_efforts: ['low'] }), { effort: 'low', exclude: true });
});

test('deep reasoning policy is explicit opt-in', () => {
  assert.deepEqual(buildDeepReasoningConfig('high'), { effort: 'high', exclude: true });
  assert.deepEqual(buildDeepReasoningConfig('xhigh'), { effort: 'xhigh', exclude: true });
});

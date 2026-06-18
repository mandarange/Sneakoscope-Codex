import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderHealthTracker } from '../../openrouter/openrouter-provider-health.js';

test('provider health tracker records and retrieves metrics', () => {
  const tracker = createProviderHealthTracker('openrouter', 'z-ai/glm-5.2');
  tracker.record({
    provider_slug: 'openrouter',
    model: 'z-ai/glm-5.2',
    p50_ttft_ms: 500,
    count_429: 0,
    count_5xx: 0,
    last_success: '2026-06-19T00:00:00Z'
  });
  const health = tracker.getHealth()!;
  assert.equal(health.model, 'z-ai/glm-5.2');
  assert.equal(health.count_429, 0);
  assert.equal(health.last_success, '2026-06-19T00:00:00Z');
});

test('provider health accumulates error counts', () => {
  const tracker = createProviderHealthTracker();
  tracker.record({ provider_slug: 'openrouter', model: 'z-ai/glm-5.2', count_429: 1, count_5xx: 0 });
  tracker.record({ provider_slug: 'openrouter', model: 'z-ai/glm-5.2', count_429: 1, count_5xx: 1 });
  const health = tracker.snapshot()!;
  assert.equal(health.count_429, 2);
  assert.equal(health.count_5xx, 1);
});

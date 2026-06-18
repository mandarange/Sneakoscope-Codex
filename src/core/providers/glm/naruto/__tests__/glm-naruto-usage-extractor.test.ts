import test from 'node:test';
import assert from 'node:assert/strict';
import { extractGlmNarutoUsageMetrics } from '../glm-naruto-usage-extractor.js';

test('extracts OpenRouter prompt cache and reasoning usage metrics', () => {
  const metrics = extractGlmNarutoUsageMetrics({
    prompt_tokens: 100,
    completion_tokens: 20,
    prompt_tokens_details: {
      cached_tokens: 80,
      cache_write_tokens: 10
    },
    completion_tokens_details: {
      reasoning_tokens: 7
    }
  });
  assert.deepEqual(metrics, {
    prompt_tokens: 100,
    completion_tokens: 20,
    reasoning_tokens: 7,
    cached_tokens: 80,
    cache_write_tokens: 10
  });
});

test('returns null for missing usage counters instead of hardcoded zero', () => {
  const metrics = extractGlmNarutoUsageMetrics({});
  assert.equal(metrics.prompt_tokens, null);
  assert.equal(metrics.cached_tokens, null);
  assert.equal(metrics.cache_write_tokens, null);
});

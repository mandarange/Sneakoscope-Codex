import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGlmRequestWithCache, createGlmEncodedRequestCache } from '../glm-request-cache.js';
import type { OpenRouterChatCompletionRequest } from '../../openrouter/openrouter-types.js';

test('cache hit returns stored body without JSON.stringify', () => {
  const cache = createGlmEncodedRequestCache(16);
  const request: OpenRouterChatCompletionRequest = {
    model: 'z-ai/glm-5.2',
    messages: [{ role: 'user', content: 'test message' }],
    stream: true,
    max_tokens: 100,
    temperature: 0.2
  };

  // First call: cache miss, stores body
  const first = encodeGlmRequestWithCache(request, cache);
  assert.equal(first.cacheHit, false);
  assert.ok(first.body.length > 0);

  // Second call: cache hit, should return stored body
  const second = encodeGlmRequestWithCache(request, cache);
  assert.equal(second.cacheHit, true);
  assert.equal(second.body, first.body);
});

test('cache hit avoids re-encoding by returning stored body', () => {
  const cache = createGlmEncodedRequestCache(16);
  const request: OpenRouterChatCompletionRequest = {
    model: 'z-ai/glm-5.2',
    messages: [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'user prompt' }],
    stream: true,
    max_tokens: 4096
  };

  const first = encodeGlmRequestWithCache(request, cache);
  const second = encodeGlmRequestWithCache(request, cache);

  // Body should be identical (cached)
  assert.equal(second.body, first.body);
  assert.equal(second.cacheHit, true);
  assert.equal(second.entry.bodyStored, true);
});

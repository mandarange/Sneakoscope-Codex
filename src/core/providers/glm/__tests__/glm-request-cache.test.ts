import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlm52Request } from '../glm-52-request.js';
import { createGlmEncodedRequestCache, encodeGlmRequestWithCache } from '../glm-request-cache.js';

test('encoded request cache reuses same request and does not store API keys', () => {
  const cache = createGlmEncodedRequestCache();
  const request = buildGlm52Request({ messages: [{ role: 'user', content: 'hello sk-or-secret bearer-token-secret' }] });
  const first = encodeGlmRequestWithCache(request, cache);
  const second = encodeGlmRequestWithCache(request, cache);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.entry.bodyStored, false);
  assert.equal(JSON.stringify(second.entry).includes('sk-or-'), false);
  assert.equal(JSON.stringify(second.entry).includes('bearer-token-secret'), false);
});

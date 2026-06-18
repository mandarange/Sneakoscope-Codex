import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyGlmLatencyTrace } from '../glm-latency-trace.js';

test('GLM latency trace has required 4.0.9 speed fields', () => {
  const trace = createEmptyGlmLatencyTrace('speed');
  assert.equal(trace.schema, 'sks.glm-latency-trace.v1');
  assert.equal(trace.version, '4.0.9');
  assert.equal(trace.openrouter_ttft_ms, null);
  assert.equal(trace.encoded_request_cache_hit, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenRouterStreamText } from '../openrouter-stream.js';

test('SSE parser yields TTFT before full response end', () => {
  const sseText = [
    'data: {"choices":[{"delta":{"content":"Hello"}}],"model":"z-ai/glm-5.2"}',
    'data: {"choices":[{"delta":{"content":" world"}}],"model":"z-ai/glm-5.2"}',
    'data: [DONE]'
  ].join('\r\n');
  const result = parseOpenRouterStreamText(sseText, Date.now());
  assert.equal(result.content, 'Hello world');
  assert.equal(result.model, 'z-ai/glm-5.2');
  assert.notEqual(result.ttft_ms, null);
  assert.equal(result.chunk_count, 2);
  assert.equal(result.real_stream, false);
});

test('SSE parser handles empty stream', () => {
  const result = parseOpenRouterStreamText('', Date.now());
  assert.equal(result.content, '');
  assert.equal(result.ttft_ms, null);
  assert.equal(result.chunk_count, 0);
});

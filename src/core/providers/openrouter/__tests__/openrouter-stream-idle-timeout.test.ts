import test from 'node:test';
import assert from 'node:assert/strict';
import { sendOpenRouterChatCompletionStream } from '../openrouter-stream.js';

function neverStreamFetch(): typeof fetch {
  return (async () => new Response(new ReadableStream({ start() {} }), { status: 200 })) as typeof fetch;
}

function delayedAfterFirstChunkFetch(): typeof fetch {
  return (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ model: 'z-ai/glm-5.2', choices: [{ delta: { content: 'a' } }] })}\n\n`));
    }
  }), { status: 200 })) as typeof fetch;
}

function normalFetch(): typeof fetch {
  return (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ model: 'z-ai/glm-5.2', choices: [{ delta: { content: 'ok' } }] })}\n\ndata: [DONE]\n\n`));
      controller.close();
    }
  }), { status: 200 })) as typeof fetch;
}

test('idle before first chunk returns typed timeout', async () => {
  const result = await sendOpenRouterChatCompletionStream({ apiKey: 'sk-or-test', request: { model: 'z-ai/glm-5.2', messages: [{ role: 'user', content: 'x' }] }, fetchImpl: neverStreamFetch(), idleTimeoutMs: 5 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'glm_stream_idle_timeout');
});

test('idle after first chunk returns typed timeout after ttft', async () => {
  const result = await sendOpenRouterChatCompletionStream({ apiKey: 'sk-or-test', request: { model: 'z-ai/glm-5.2', messages: [{ role: 'user', content: 'x' }] }, fetchImpl: delayedAfterFirstChunkFetch(), idleTimeoutMs: 5 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'glm_stream_idle_timeout_after_ttft');
});

test('normal stream completes', async () => {
  const result = await sendOpenRouterChatCompletionStream({ apiKey: 'sk-or-test', request: { model: 'z-ai/glm-5.2', messages: [{ role: 'user', content: 'x' }] }, fetchImpl: normalFetch(), idleTimeoutMs: 100 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.content, 'ok');
});

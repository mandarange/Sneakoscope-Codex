import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { runVerifierWorker } from '../glm-naruto-worker-runtime.js';

function envelope() {
  return createPatchEnvelope({
    missionId: 'M-test',
    workerId: 'worker-1',
    shardId: 'shard-1',
    baseDigest: 'base',
    patch: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n',
    strategy: 'minimal_patch',
    reasoningEffort: 'low'
  });
}

function fetchWithSse(content: string, model?: string): typeof fetch {
  return (async () => {
    const frame = `data: ${JSON.stringify({ model, choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frame));
        controller.close();
      }
    }), { status: 200 });
  }) as typeof fetch;
}

test('verifier fails missing model', async () => {
  const result = await runVerifierWorker({ apiKey: 'sk-or-test', missionId: 'M-test', workerId: 'w1', envelope: envelope(), timeoutMs: 1000, fetchImpl: fetchWithSse('{"schema":"sks.glm-naruto-verifier-output.v1","ok":true,"issues":[],"risk_score":0,"confidence":1}') });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('model_guard:glm_model_missing'));
});

test('verifier fails gpt model', async () => {
  const result = await runVerifierWorker({ apiKey: 'sk-or-test', missionId: 'M-test', workerId: 'w1', envelope: envelope(), timeoutMs: 1000, fetchImpl: fetchWithSse('{"schema":"sks.glm-naruto-verifier-output.v1","ok":true,"issues":[],"risk_score":0,"confidence":1}', 'openai/gpt-5') });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('model_guard:glm_model_mismatch'));
});

test('verifier fails malformed JSON and ok false', async () => {
  const malformed = await runVerifierWorker({ apiKey: 'sk-or-test', missionId: 'M-test', workerId: 'w1', envelope: envelope(), timeoutMs: 1000, fetchImpl: fetchWithSse('not json', 'z-ai/glm-5.2') });
  assert.equal(malformed.ok, false);
  assert.ok(malformed.issues.includes('malformed_json'));

  const rejected = await runVerifierWorker({ apiKey: 'sk-or-test', missionId: 'M-test', workerId: 'w1', envelope: envelope(), timeoutMs: 1000, fetchImpl: fetchWithSse('{"schema":"sks.glm-naruto-verifier-output.v1","ok":false,"issues":["bad"],"risk_score":0.8,"confidence":0.4}', 'z-ai/glm-5.2') });
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.issues, ['bad']);
});

test('verifier passes valid guarded JSON', async () => {
  const result = await runVerifierWorker({ apiKey: 'sk-or-test', missionId: 'M-test', workerId: 'w1', envelope: envelope(), timeoutMs: 1000, fetchImpl: fetchWithSse('{"schema":"sks.glm-naruto-verifier-output.v1","ok":true,"issues":[],"risk_score":0,"confidence":1}', 'z-ai/glm-5.2') });
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

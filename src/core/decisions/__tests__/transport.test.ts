import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOpenRouterApiKey } from '../../providers/openrouter/openrouter-secret-store.js';
import {
  encodeRequest,
  OPENROUTER_DECISIONS_ENDPOINT,
  requestOpenRouterDecision,
  resetDecisionTransportState
} from '../openrouter.js';
import { officialSubagentLifecycleLockHeld, withOfficialSubagentLifecycleLock } from '../../subagents/official-subagent-lock.js';
import { planningBundle, SYNTHETIC_RESPONSE } from './fixtures.js';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';

test.afterEach(() => resetDecisionTransportState());

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

test('transport posts only the native Decisions endpoint with snake_case provider keys', async () => {
  const bundle = planningBundle();
  const encoded = encodeRequest(bundle.request);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) return;
  const parsed = JSON.parse(encoded.body);
  assert.equal(parsed.provider.zdr, true);
  assert.equal(parsed.provider.data_collection, 'deny');
  assert.equal(parsed.provider.allow_fallbacks, false);
  assert.equal('dataCollection' in parsed.provider, false);
  assert.equal('messages' in parsed, false);
  assert.equal('tools' in parsed, false);
  assert.equal('response_format' in parsed, false);
  const seen: string[] = [];
  await requestOpenRouterDecision(bundle, {
    env: { OPENROUTER_API_KEY: 'sk-or-test-aaaaaaaaaaaaaaaa' },
    fetchImpl: async (url, init) => {
      seen.push(String(url));
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      const body = String(init?.body || '');
      assert.doesNotMatch(body, /\/api\/v1\/chat\/completions/);
      assert.doesNotMatch(body, /systemone/);
      assert.match(String(init?.headers && (init.headers as Record<string, string>)['Content-Type']), /application\/json/);
      return jsonResponse(SYNTHETIC_RESPONSE);
    }
  });
  assert.deepEqual(seen, [OPENROUTER_DECISIONS_ENDPOINT]);
  assert.doesNotMatch(OPENROUTER_DECISIONS_ENDPOINT, /\/api\/v1\//);
});

test('credential reuse uses the existing OpenRouter helper and never a Jev secret file', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-cred-'));
  const env = { HOME: home, OPENROUTER_API_KEY: 'sk-or-test-bbbbbbbbbbbbbbbb' };
  const resolved = await resolveOpenRouterApiKey({ env });
  assert.equal(resolved.source, 'env');
  assert.equal(resolved.key, 'sk-or-test-bbbbbbbbbbbbbbbb');
  const files = await fsp.readdir(home).catch(() => []);
  assert.equal(files.some((name) => /jev/i.test(name)), false);
  await fsp.rm(home, { recursive: true, force: true });
});

test('401/402/429/5xx, malformed JSON, and aborted calls keep unknown usage', async () => {
  const bundle = planningBundle();
  const env = { OPENROUTER_API_KEY: 'sk-or-test-cccccccccccccccc' };
  const unauthorized = await requestOpenRouterDecision(bundle, {
    env,
    fetchImpl: async () => jsonResponse({ error: 'no' }, 401)
  });
  assert.equal(unauthorized.ok, false);
  if (!unauthorized.ok) assert.equal(unauthorized.reason, 'unauthorized');

  resetDecisionTransportState();
  const payment = await requestOpenRouterDecision(bundle, {
    env,
    fetchImpl: async () => jsonResponse({ error: 'credits' }, 402)
  });
  assert.equal(payment.ok, false);
  if (!payment.ok) assert.equal(payment.reason, 'payment_required');

  resetDecisionTransportState();
  const malformed = await requestOpenRouterDecision(bundle, {
    env,
    fetchImpl: async () => new Response('{not json', { status: 200 })
  });
  assert.equal(malformed.ok, false);

  resetDecisionTransportState();
  const controller = new AbortController();
  controller.abort();
  const cancelled = await requestOpenRouterDecision(bundle, {
    env,
    signal: controller.signal,
    fetchImpl: async () => jsonResponse(SYNTHETIC_RESPONSE)
  });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) {
    assert.equal(cancelled.reason, 'cancelled');
    assert.equal(cancelled.usage.evidence, 'unknown');
    assert.equal(cancelled.usage.inputTokens, null);
  }
});

test('in-flight cap returns busy and circuit opens after three transport failures', async () => {
  const bundle = planningBundle();
  const env = { OPENROUTER_API_KEY: 'sk-or-test-dddddddddddddddd' };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  let releaseStarted!: () => void;
  const bothStarted = new Promise<void>((resolve) => { releaseStarted = resolve; });
  const hang = async () => {
    started += 1;
    if (started === 2) releaseStarted();
    await gate;
    return jsonResponse(SYNTHETIC_RESPONSE);
  };
  const hanging = requestOpenRouterDecision(bundle, { env, fetchImpl: hang });
  const hanging2 = requestOpenRouterDecision(bundle, { env, fetchImpl: hang });
  await bothStarted;
  const busy = await requestOpenRouterDecision(bundle, {
    env,
    fetchImpl: async () => jsonResponse(SYNTHETIC_RESPONSE)
  });
  assert.equal(busy.ok, false);
  if (!busy.ok) assert.equal(busy.reason, 'busy');
  release();
  await Promise.all([hanging, hanging2]);

  resetDecisionTransportState();
  for (let index = 0; index < 3; index += 1) {
    await requestOpenRouterDecision(bundle, {
      env,
      fetchImpl: async () => jsonResponse({ error: 'down' }, 500)
    });
  }
  const blocked = await requestOpenRouterDecision(bundle, {
    env,
    fetchImpl: async () => jsonResponse(SYNTHETIC_RESPONSE)
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, 'circuit_open');
});

test('transport refuses to run while the official subagent lifecycle lock is held', async () => {
  const bundle = planningBundle();
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-lock-'));
  let fetched = false;
  await withOfficialSubagentLifecycleLock(dir, async () => {
    assert.equal(officialSubagentLifecycleLockHeld(), true);
    const result = await requestOpenRouterDecision(bundle, {
      env: { OPENROUTER_API_KEY: 'sk-or-test-eeeeeeeeeeeeeeee' },
      fetchImpl: async () => {
        fetched = true;
        return jsonResponse(SYNTHETIC_RESPONSE);
      }
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.detail, /lifecycle_lock/);
  });
  assert.equal(fetched, false);
  await fsp.rm(dir, { recursive: true, force: true });
});

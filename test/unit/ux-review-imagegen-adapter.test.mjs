import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';
import { buildCalloutPrompt, createCodexAppImagegenAdapter, generateGptImage2CalloutReview, imagegenCapabilityBlocker } from '../../dist/core/image-ux-review/imagegen-adapter.js';

test('Codex App imagegen adapter blocks honestly when host capability is unavailable', async () => {
  const adapter = createCodexAppImagegenAdapter();
  assert.equal(adapter.model, 'gpt-image-2');
  assert.equal(adapter.available, false);
  const result = await adapter.generateCalloutReview({});
  assert.equal(result.blocker, 'imagegen_capability_missing');
  assert.equal(imagegenCapabilityBlocker().model, 'gpt-image-2');
  assert.match(buildCalloutPrompt('screen-1'), /Text-only response is invalid/);
});

test('Codex App imagegen reports missing generated output separately from missing capability', async () => {
  const { root, imagePath } = await tempImageRoot('sks-codex-imagegen-output-missing-');
  const outputDir = path.join(root, 'out');
  const result = await withoutImagegenOutputEnv(() => generateGptImage2CalloutReview({
    mission_id: null,
    source_screen_id: 'screen-1',
    source_image_path: imagePath,
    output_dir: outputDir,
    prompt: buildCalloutPrompt('screen-1'),
    requested_fidelity: 'original',
    privacy: 'local-only'
  }, {
    capability: { codexAppAvailable: true },
    openai: { apiKey: null }
  }));

  assert.equal(result.ok, false);
  assert.equal(result.provider, 'codex_app_imagegen');
  assert.equal(result.blocker, 'codex_app_imagegen_output_missing');
});

test('gpt-image-2 fallback uses codex-lb key when provider disables OpenAI OAuth', async () => {
  const { root, imagePath } = await tempImageRoot('sks-codex-lb-imagegen-');
  const outputDir = path.join(root, 'out');
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), authorization: init?.headers?.authorization || init?.headers?.Authorization || '' });
    return new Response(JSON.stringify({
      data: [{
        id: 'img_lb_1',
        b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l/5gVQAAAABJRU5ErkJggg=='
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await withoutImagegenOutputEnv(() => generateGptImage2CalloutReview({
      mission_id: null,
      source_screen_id: 'screen-1',
      source_image_path: imagePath,
      output_dir: outputDir,
      prompt: buildCalloutPrompt('screen-1'),
      requested_fidelity: 'original',
      privacy: 'local-only'
    }, {
      capability: {
        codexBin: path.join(root, 'missing-codex'),
        timeoutMs: 100,
        env: { HOME: root, CODEX_LB_API_KEY: 'sk-clb-test' },
        configText: codexLbConfig()
      },
      openai: { codexLbApiKey: 'sk-clb-test' }
    }));

    assert.equal(result.ok, true);
    assert.equal(result.provider, 'openai_images_api');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://lb.example.test/backend-api/codex/images/edits');
    assert.equal(calls[0].authorization, 'Bearer sk-clb-test');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function codexLbConfig() {
  return `model_provider = "codex-lb"

[model_providers.codex-lb]
name = "OpenAI"
base_url = "https://lb.example.test/backend-api/codex"
wire_api = "responses"
env_key = "CODEX_LB_API_KEY"
supports_websockets = true
requires_openai_auth = false
`;
}

async function withoutImagegenOutputEnv(fn) {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousOutput = process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT;
  const previousFake = process.env.SKS_TEST_FAKE_IMAGEGEN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT;
  delete process.env.SKS_TEST_FAKE_IMAGEGEN;
  try {
    return await fn();
  } finally {
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousOutput === undefined) delete process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT;
    else process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT = previousOutput;
    if (previousFake === undefined) delete process.env.SKS_TEST_FAKE_IMAGEGEN;
    else process.env.SKS_TEST_FAKE_IMAGEGEN = previousFake;
  }
}

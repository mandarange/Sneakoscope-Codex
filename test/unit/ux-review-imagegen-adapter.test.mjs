import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';
import {
  DEFAULT_IMAGEGEN_FETCH_TIMEOUT_MS,
  buildCalloutPrompt,
  generateImagegenCalloutReview,
  imagegenCapabilityBlocker
} from '../../dist/core/image-ux-review/imagegen-adapter.js';

const ONE_PX_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l/5gVQAAAABJRU5ErkJggg==';

test('the callout adapter keeps its documented timeout, the active-mode blocker and the image-only prompt', () => {
  assert.equal(DEFAULT_IMAGEGEN_FETCH_TIMEOUT_MS, 180000);
  assert.equal(imagegenCapabilityBlocker().model, 'active-sks-image-mode');
  assert.match(buildCalloutPrompt('screen-1'), /Text-only response is invalid/);
});

test('UX callouts go through sks imagegen with the screenshot as reference and record its model', async () => {
  const { root, imagePath } = await tempImageRoot('sks-ux-callout-sks-imagegen-');
  const outputDir = path.join(root, 'out');
  const calls = [];
  const generateImpl = async (input) => {
    calls.push(input);
    const bytes = Buffer.from(ONE_PX_PNG, 'base64');
    await fs.writeFile(input.outPath, bytes);
    return {
      schema: 'sks.imagegen-generate.v1', ok: true, mode: 'openrouter', model: 'google/gemini-3.1-flash-image', provider: 'openrouter', via: 'bridge',
      evidence_class: 'sks_custom_imagegen', output_source: 'sks_custom_imagegen_output', route_model: null,
      outputs: [{ path: input.outPath, sha256: createHash('sha256').update(bytes).digest('hex'), mime: 'image/png', bytes: bytes.length }],
      usage: { cost: 0.01 }, blockers: [], warnings: []
    };
  };
  const result = await withoutApiFallbackEnv(() => generateImagegenCalloutReview(imagegenRequest(imagePath, outputDir), { generateImpl }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.provider, 'sks_imagegen_openrouter');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].references, [path.resolve(imagePath)]);
  assert.match(calls[0].prompt, /Text-only response is invalid/);
  const response = JSON.parse(await fs.readFile(path.join(outputDir, 'image-ux-imagegen-response.json'), 'utf8'));
  assert.equal(response.evidence_class, 'sks_custom_imagegen');
  assert.equal(response.output_source, 'sks_custom_imagegen_output');
  assert.equal(response.model, 'google/gemini-3.1-flash-image');
  assert.equal(response.imagegen_mode, 'openrouter');
  assert.equal(response.output_sha256, createHash('sha256').update(Buffer.from(ONE_PX_PNG, 'base64')).digest('hex'));
});

test('a blocked SKS image never detours to an ambient OPENAI_API_KEY', async () => {
  const { root, imagePath } = await tempImageRoot('sks-ux-callout-no-fallback-');
  const outputDir = path.join(root, 'out');
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('unexpected OpenAI fallback fetch'); };
  try {
    const result = await withoutApiFallbackEnv(async () => {
      process.env.OPENAI_API_KEY = 'ambient-openai-secret';
      return generateImagegenCalloutReview(imagegenRequest(imagePath, outputDir), { generateImpl: blockedImage });
    });
    assert.equal(result.ok, false);
    assert.equal(result.provider, 'sks_imagegen_codex');
    assert.equal(result.blocker, 'desktop_bridge_not_configured');
    const response = JSON.parse(await fs.readFile(path.join(outputDir, 'image-ux-imagegen-response.json'), 'utf8'));
    assert.equal(response.blocker, 'desktop_bridge_not_configured');
    assert.doesNotMatch(JSON.stringify(response), /ambient-openai-secret/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('the explicit Images API fallback sends a concrete model and retries transient errors', async () => {
  const { root, imagePath } = await tempImageRoot('sks-imagegen-openai-retry-');
  let calls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/images/edits');
    assert.equal(init.body.get('model'), 'gpt-image-2');
    assert.equal(init.body.get('quality'), 'max');
    calls += 1;
    if (calls <= 2) return new Response(JSON.stringify({ error: { type: 'rate_limit_exceeded', message: 'slow down' } }), { status: 429, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ data: [{ b64_json: ONE_PX_PNG }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await withoutApiFallbackEnv(() => generateImagegenCalloutReview(imagegenRequest(imagePath, path.join(root, 'out')), {
      generateImpl: blockedImage,
      openai: { apiKey: 'explicit-openai-key', quality: 'max', retrySleep: async () => {} },
      allowApiFallback: true
    }));
    assert.equal(calls, 3);
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'openai_images_api');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

async function blockedImage() {
  return {
    schema: 'sks.imagegen-generate.v1', ok: false, mode: 'codex', model: 'codex-default', provider: 'codex-bridge-route', via: null,
    evidence_class: null, output_source: null, route_model: 'gpt-6-astra', outputs: [], usage: null,
    blockers: ['desktop_bridge_not_configured'], warnings: []
  };
}

function imagegenRequest(imagePath, outputDir) {
  return {
    mission_id: null,
    source_screen_id: 'screen-1',
    source_image_path: imagePath,
    output_dir: outputDir,
    prompt: buildCalloutPrompt('screen-1'),
    requested_fidelity: 'original',
    privacy: 'local-only'
  };
}

async function withoutApiFallbackEnv(fn) {
  const names = ['OPENAI_API_KEY', 'SKS_IMAGEGEN_ALLOW_API_FALLBACK', 'SKS_TEST_FAKE_IMAGEGEN', 'SKS_IMAGEGEN_API_MODEL'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  try {
    return await fn();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

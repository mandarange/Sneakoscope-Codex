import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { handleDesktopBridgeImagegen } from '../../dist/core/codex-lb/desktop-bridge/imagegen-endpoint.js';
import { fitAspectRatio, generateOpenRouterImages, imageModelsFromCatalog } from '../../dist/core/imagegen/openrouter-images.js';
import { writeImagegenConfig } from '../../dist/core/imagegen/imagegen-config.js';

const ONE_PX_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l/5gVQAAAABJRU5ErkJggg==';
const MODEL = 'google/gemini-3.1-flash-image';

test('the model list reads the Image API parameters and skips router ids', () => {
  const models = imageModelsFromCatalog({ data: [
    { id: MODEL, name: 'Gemini Image', architecture: { input_modalities: ['image', 'text'], output_modalities: ['image', 'text'] },
      supported_parameters: { aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] }, input_references: { type: 'range', min: 0, max: 14 } } },
    { id: 'recraft/recraft-v4.1-flash', architecture: { input_modalities: ['text'], output_modalities: ['image'] }, supported_parameters: { n: { type: 'range', min: 1, max: 6 } } },
    { id: 'openrouter/auto', architecture: { output_modalities: ['image', 'text'] } },
    { id: 'anthropic/claude-sonnet-5', architecture: { output_modalities: ['text'] } }
  ] });
  assert.deepEqual(models.map((row) => [row.id, row.max_references, row.aspect_ratios]), [
    [MODEL, 14, ['1:1', '16:9']],
    ['recraft/recraft-v4.1-flash', 0, null]
  ]);
  assert.equal(fitAspectRatio('21:9', ['1:1', '16:9', '9:16', 'auto']), '16:9');
  assert.equal(fitAspectRatio('4:5', ['1:1', '16:9', '9:16']), '1:1');
  assert.equal(fitAspectRatio('16:9', null), '16:9', 'unknown limits keep the request');
});

test('OpenRouter images come from the Image API, fitted to the model, and never from a text answer', async () => {
  const info = { id: MODEL, name: MODEL, input_modalities: ['text', 'image'], output_modalities: ['image'], aspect_ratios: ['1:1', '16:9'], qualities: ['low', 'high'], max_references: 1, pricing: { prompt: null, completion: null, image: null }, context_length: null };
  const calls = [];
  const images = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ created: 1, data: [{ b64_json: ONE_PX_PNG, media_type: 'image/png' }], usage: { cost: 0.03 } }), { status: 200 });
  };
  const png = { mime: 'image/png', base64: ONE_PX_PNG };
  const ok = await generateOpenRouterImages({ apiKey: 'k', model: MODEL, prompt: 'a dot', aspectRatio: '21:9', quality: 'medium', references: [png, png], modelInfo: info, fetchImpl: images });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.images, [png]);
  assert.equal(ok.usage.cost, 0.03);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/images');
  assert.equal(calls[0].body.aspect_ratio, '16:9');
  assert.equal('quality' in calls[0].body, false, 'a quality the model does not list is left out');
  assert.deepEqual(calls[0].body.input_references, [{ type: 'image_url', image_url: { url: `data:image/png;base64,${ONE_PX_PNG}` } }]);
  assert.deepEqual(ok.warnings, ['openrouter_references_trimmed:1', 'openrouter_aspect_ratio_fitted:16:9']);

  const noEdit = await generateOpenRouterImages({ apiKey: 'k', model: MODEL, prompt: 'a dot', references: [png], modelInfo: { ...info, max_references: 0 },
    fetchImpl: async () => { throw new Error('must not call OpenRouter'); } });
  assert.deepEqual(noEdit, { ok: false, error: 'openrouter_model_takes_no_reference_images', status: null });

  const chat = async (url) => String(url).endsWith('/images')
    ? new Response('not found', { status: 404 })
    : new Response(JSON.stringify({ model: MODEL, choices: [{ message: { content: 'I cannot draw that.' } }] }), { status: 200 });
  const textOnly = await generateOpenRouterImages({ apiKey: 'k', model: MODEL, prompt: 'a dot', modelInfo: null, fetchImpl: chat });
  assert.equal(textOnly.ok, false);
  assert.match(textOnly.error, /^openrouter_image_missing:/);
  const paid = await generateOpenRouterImages({ apiKey: 'k', model: MODEL, prompt: 'a dot', modelInfo: null, fetchImpl: async () => new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 }) });
  assert.equal(paid.status, 402);
  assert.match(paid.error, /^openrouter_image_http_402:/);
});

test('the bridge image endpoint serves only the chosen model, with the key it holds', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-bridge-imagegen-endpoint-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { HOME: home };
  const calls = [];
  const generate = async (input) => {
    calls.push(input);
    return { ok: true, model: MODEL, images: [{ mime: 'image/png', base64: ONE_PX_PNG }], text: '', usage: { prompt_tokens: null, completion_tokens: null, cost: 0.03 }, warnings: [] };
  };
  const post = (body, method = 'POST', extraEnv = {}) => call(method, body, { env: { ...env, ...extraEnv }, generate });

  assert.deepEqual(await post({ prompt: 'a dot' }, 'GET'), { status: 405, error: 'imagegen_method_not_allowed' });
  assert.deepEqual(await post({ prompt: 'a dot' }), { status: 409, error: 'imagegen_custom_mode_off' });
  await writeImagegenConfig({ mode: 'openrouter', openrouterModel: MODEL }, env);
  assert.deepEqual(await post({ prompt: '  ' }), { status: 400, error: 'imagegen_prompt_required' });
  assert.deepEqual(await post({ prompt: 'a dot', model: 'openai/gpt-5-image' }), { status: 409, error: 'imagegen_model_not_selected' });
  assert.deepEqual(await post({ prompt: 'a dot' }), { status: 424, error: 'openrouter_key_missing' });
  assert.deepEqual(await post({ prompt: 'a dot', references: [{ mime: 'text/html', base64: 'AAAA' }] }, 'POST', { OPENROUTER_API_KEY: 'bridge-held-key' }), { status: 400, error: 'imagegen_references_invalid' });
  assert.equal(calls.length, 0, 'nothing reaches OpenRouter before every check passes');

  const ok = await post({ prompt: 'a dot', aspect_ratio: '16:9', references: [{ mime: 'image/png', base64: ONE_PX_PNG }] }, 'POST', { OPENROUTER_API_KEY: 'bridge-held-key' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.model, MODEL);
  assert.equal(ok.body.images.length, 1);
  assert.doesNotMatch(JSON.stringify(ok.body), /bridge-held-key/);
  assert.equal(calls[0].apiKey, 'bridge-held-key');
  assert.equal(calls[0].aspectRatio, '16:9');
  assert.equal(calls[0].references.length, 1);
});

async function call(method, body, deps) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method });
  const res = {
    headersSent: false,
    status: 0,
    text: '',
    writeHead(status) { this.status = status; this.headersSent = true; },
    end(text) { this.text = String(text || ''); },
    destroy() {}
  };
  await handleDesktopBridgeImagegen(req, res, deps);
  const payload = JSON.parse(res.text);
  assert.equal(payload.schema, 'sks.desktop-bridge-imagegen.v1');
  return payload.ok ? { status: res.status, body: payload } : { status: res.status, error: payload.error };
}

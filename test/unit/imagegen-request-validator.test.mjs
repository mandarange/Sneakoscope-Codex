import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImagegenRequest } from '../../dist/core/imagegen/imagegen-request-validator.js';

function request(root, overrides = {}) {
  return {
    provider: 'sks_imagegen',
    endpoint: 'sks imagegen generate',
    model: 'google/gemini-3.1-flash-image',
    prompt: 'Annotate this UI screenshot.',
    source_image_path: path.resolve('test/fixtures/images/one-by-one.png'),
    output_dir: root,
    params: { size: 'auto' },
    privacy: 'local-only',
    ...overrides
  };
}

test('any recorded image model is accepted; a missing model and input_fidelity are not', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-image-validator-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const model of ['google/gemini-3.1-flash-image', 'gpt-image-2', 'codex-default']) {
    assert.equal((await validateImagegenRequest(request(root, { model }))).ok, true, model);
  }
  assert.ok((await validateImagegenRequest(request(root, { model: '' }))).blockers.includes('imagegen_model_missing'));
  const fidelity = await validateImagegenRequest(request(root, { params: { input_fidelity: 'high' } }));
  assert.ok(fidelity.blockers.includes('input_fidelity_must_be_omitted_for_imagegen'));
});

test('size, quality and transparency limits hold for every model', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-image-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const params = { size: '1536x864', quality: 'max', background: 'transparent', output_format: 'png' };
  assert.equal((await validateImagegenRequest(request(root, { params }))).ok, true);
  for (const size of ['1537x864', '4096x2048', '3840x3840', '512x512', '3072x768']) {
    const result = await validateImagegenRequest(request(root, { params: { ...params, size } }));
    assert.ok(result.blockers.includes('unsupported_image_size'), size);
  }
  assert.ok((await validateImagegenRequest(request(root, { params: { ...params, quality: 'ultra' } }))).blockers.includes('unsupported_image_quality'));
  const jpeg = await validateImagegenRequest(request(root, { params: { ...params, output_format: 'jpeg' } }));
  assert.ok(jpeg.blockers.includes('transparent_background_requires_png_or_webp'));
});

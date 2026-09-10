import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImagegenRequest } from '../../dist/core/imagegen/imagegen-request-validator.js';

test('gpt-image-2.5-sunburst validator accepts clean local image request and rejects input_fidelity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-image-validator-test-'));
  const source = path.join(root, 'source.png');
  fs.copyFileSync(path.join(process.cwd(), 'test', 'fixtures', 'images', 'one-by-one.png'), source);
  const good = await validateImagegenRequest({
    provider: 'fake_imagegen_adapter',
    endpoint: 'local hermetic fixture',
    model: 'gpt-image-2.5-sunburst',
    prompt: 'Annotate this UI screenshot.',
    source_image_path: source,
    output_dir: root,
    params: { size: 'auto' },
    privacy: 'local-only'
  });
  const bad = await validateImagegenRequest({
    provider: 'openai_images_api',
    endpoint: '/v1/images/edits',
    model: 'gpt-image-2.5-sunburst',
    prompt: 'Annotate this UI screenshot.',
    source_image_path: source,
    output_dir: root,
    params: { input_fidelity: 'high' },
    privacy: 'local-only'
  });
  assert.equal(good.ok, true);
  assert.equal(bad.ok, false);
  assert.ok(bad.blockers.includes('input_fidelity_must_be_omitted_for_imagegen'));
});

test('current GPT Image contract accepts custom dimensions, max quality and transparent PNG without downgrading', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-image-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = {
    provider: 'openai_images_api', endpoint: '/v1/images/edits', model: 'gpt-image-2.5-sunburst',
    prompt: 'Preserve this reference.', source_image_path: path.resolve('test/fixtures/images/one-by-one.png'),
    output_dir: root, privacy: 'local-only',
    params: { size: '1536x864', quality: 'max', background: 'transparent', output_format: 'png' }
  };
  assert.equal((await validateImagegenRequest(input)).ok, true);
  for (const model of ['gpt-image-2', 'gpt-image-1.5', 'chatgpt-image-latest']) {
    const result = await validateImagegenRequest({ ...input, model });
    assert.ok(result.blockers.includes('imagegen_model_not_current'));
  }
  for (const size of ['1537x864', '4096x2048', '3840x3840', '512x512', '3072x768']) {
    const result = await validateImagegenRequest({ ...input, params: { ...input.params, size } });
    assert.ok(result.blockers.includes('unsupported_image_size'), size);
  }
  const jpeg = await validateImagegenRequest({ ...input, params: { ...input.params, output_format: 'jpeg' } });
  assert.ok(jpeg.blockers.includes('transparent_background_requires_png_or_webp'));
});

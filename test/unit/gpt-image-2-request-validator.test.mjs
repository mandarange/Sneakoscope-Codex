import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGptImage2Request } from '../../dist/core/imagegen/gpt-image-2-request-validator.js';

test('gpt-image-2 validator accepts clean local image request and rejects input_fidelity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-image-validator-test-'));
  const source = path.join(root, 'source.png');
  fs.copyFileSync(path.join(process.cwd(), 'test', 'fixtures', 'images', 'one-by-one.png'), source);
  const good = await validateGptImage2Request({
    provider: 'fake_imagegen_adapter',
    endpoint: 'local hermetic fixture',
    model: 'gpt-image-2',
    prompt: 'Annotate this UI screenshot.',
    source_image_path: source,
    output_dir: root,
    params: { size: 'auto' },
    privacy: 'local-only'
  });
  const bad = await validateGptImage2Request({
    provider: 'openai_images_api',
    endpoint: '/v1/images/edits',
    model: 'gpt-image-2',
    prompt: 'Annotate this UI screenshot.',
    source_image_path: source,
    output_dir: root,
    params: { input_fidelity: 'high' },
    privacy: 'local-only'
  });
  assert.equal(good.ok, true);
  assert.equal(bad.ok, false);
  assert.ok(bad.blockers.includes('input_fidelity_must_be_omitted_for_gpt_image_2'));
});

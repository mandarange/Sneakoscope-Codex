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

async function withoutImagegenOutputEnv(fn) {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousOutput = process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT;
  delete process.env.OPENAI_API_KEY;
  delete process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT;
  try {
    return await fn();
  } finally {
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousOutput === undefined) delete process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT;
    else process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT = previousOutput;
  }
}

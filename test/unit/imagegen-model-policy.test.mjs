import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { planPptImageAssets, buildPptImageAssetLedger } from '../../dist/core/ppt.js';
import { buildSlideImagegenEvidence } from '../../dist/core/ppt-review/slide-imagegen-review.js';

test('PPT asset reuse rejects an older model even when the output file and hash match', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ppt-image-model-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bytes = await fs.readFile('test/fixtures/images/one-by-one.png');
  await fs.writeFile(path.join(root, 'output.png'), bytes);
  const contract = { answers: { PRESENTATION_IMAGE_ASSETS_REQUIRED: true, PRESENTATION_IMAGE_ASSET_REQUESTS: ['a product illustration'] } };
  const storyboard = { pages: [{ number: 1, kind: 'cover', claim: 'Product' }] };
  const plan = planPptImageAssets(contract, storyboard, {});
  assert.equal(plan[0].model, 'gpt-image-2.5-sunburst');
  assert.equal(plan[0].imagegen_invocation.tool_mode, 'explicit_image_generation_model');
  const asset = { ...plan[0], status: 'generated', output_path: 'output.png',
    output_sha256: createHash('sha256').update(bytes).digest('hex'),
    evidence_class: 'codex_lb_provider_imagegen', output_source: 'codex_lb_provider_responses' };
  const previous = await buildPptImageAssetLedger(root, contract, storyboard, {}, { assets: [{ ...asset, model: 'gpt-image-2' }] });
  assert.equal(previous.passed, false);
  assert.ok(previous.blockers.includes('ppt_image_asset_model_not_current'));
  const current = await buildPptImageAssetLedger(root, contract, storyboard, {}, { assets: [asset] });
  assert.equal(current.passed, true);
});

test('PPT callout evidence requires a recorded current model instead of trusting a native output label', () => {
  const image = { image_path: 'review.png', evidence_class: 'codex_lb_provider_imagegen',
    output_source: 'codex_lb_provider_responses', output_sha256: 'digest', sha256: 'digest', real_generated: true };
  for (const provider_model of [undefined, 'gpt-image-2']) {
    const result = buildSlideImagegenEvidence({ required_count: 1, generated_review_images: [{ ...image, provider_model }] });
    assert.equal(result.passed, false);
    assert.ok(result.blockers.includes('ppt_slide_imagegen_model_not_current'));
  }
  assert.equal(buildSlideImagegenEvidence({ required_count: 1,
    generated_review_images: [{ ...image, provider_model: 'gpt-image-2.5-sunburst' }] }).passed, true);
});

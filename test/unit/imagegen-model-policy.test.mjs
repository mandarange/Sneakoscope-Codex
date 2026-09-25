import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { planPptImageAssets, buildPptImageAssetLedger } from '../../dist/core/ppt.js';
import { buildSlideImagegenEvidence } from '../../dist/core/ppt-review/slide-imagegen-review.js';

const contract = { answers: { PRESENTATION_IMAGE_ASSETS_REQUIRED: true, PRESENTATION_IMAGE_ASSET_REQUESTS: ['a product illustration'] } };
const storyboard = { pages: [{ number: 1, kind: 'cover', claim: 'Product' }] };

test('PPT assets follow the active image mode and never pin an engine', () => {
  const codex = planPptImageAssets(contract, storyboard, {});
  assert.equal(codex[0].model, 'codex-default');
  assert.equal(codex[0].imagegen_mode, 'codex');
  assert.equal(codex[0].imagegen_invocation.tool_mode, 'codex_default_image_generation');
  const custom = planPptImageAssets(contract, storyboard, {}, { mode: 'openrouter', model: 'google/gemini-3.1-flash-image', label: 'OpenRouter' });
  assert.equal(custom[0].model, 'google/gemini-3.1-flash-image');
  assert.equal(custom[0].imagegen_invocation.tool_mode, 'sks_custom_image_model');
});

test('PPT asset evidence needs a recorded model, and the sks imagegen sidecar supplies it', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ppt-image-model-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  t.after(async () => {
    process.env.HOME = previousHome;
    await fs.rm(root, { recursive: true, force: true });
  });
  const bytes = await fs.readFile('test/fixtures/images/one-by-one.png');
  const sha = createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(path.join(root, 'output.png'), bytes);
  const id = planPptImageAssets(contract, storyboard, {})[0].id;

  const unrecorded = await buildPptImageAssetLedger(root, contract, storyboard, {}, { assets: [{ id, status: 'generated', output_path: 'output.png', model: 'unknown',
    evidence_class: 'sks_custom_imagegen', output_source: 'sks_custom_imagegen_output', output_sha256: sha }] });
  assert.equal(unrecorded.passed, false);
  assert.ok(unrecorded.blockers.includes('ppt_image_asset_model_missing'));

  await fs.writeFile(path.join(root, 'output.png.sks-imagegen.json'), JSON.stringify({
    schema: 'sks.imagegen-output.v1', mode: 'openrouter', model: 'google/gemini-3.1-flash-image', provider: 'openrouter', via: 'bridge',
    evidence_class: 'sks_custom_imagegen', output_source: 'sks_custom_imagegen_output', sha256: sha, mime: 'image/png', bytes: bytes.length,
    route_model: null, created_at: '2026-09-25T00:00:00.000Z'
  }));
  const recorded = await buildPptImageAssetLedger(root, contract, storyboard, {}, { assets: [{ id, status: 'generated', output_path: 'output.png' }] });
  assert.equal(recorded.passed, true, JSON.stringify(recorded.blockers));
  assert.equal(recorded.assets[0].model, 'google/gemini-3.1-flash-image');
  assert.equal(recorded.assets[0].evidence_verified, true);
});

test('PPT callout evidence needs a recorded model, not a pinned one', () => {
  const image = { image_path: 'review.png', evidence_class: 'codex_bridge_route_imagegen',
    output_source: 'codex_bridge_route_responses', output_sha256: 'digest', sha256: 'digest', real_generated: true };
  for (const provider_model of [undefined, '', 'unknown', 'placeholder']) {
    const result = buildSlideImagegenEvidence({ required_count: 1, generated_review_images: [{ ...image, provider_model }] });
    assert.equal(result.passed, false, String(provider_model));
    assert.ok(result.blockers.includes('ppt_slide_imagegen_model_missing'));
  }
  for (const provider_model of ['codex-default', 'gpt-image-2', 'google/gemini-3.1-flash-image']) {
    assert.equal(buildSlideImagegenEvidence({ required_count: 1, generated_review_images: [{ ...image, provider_model }] }).passed, true, provider_model);
  }
});

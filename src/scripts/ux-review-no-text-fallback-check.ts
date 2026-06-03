#!/usr/bin/env node
// @ts-nocheck
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const mod = await import(pathToFileURL(path.join(root, 'dist/core/image-ux-review.js')));

const contract = { prompt: 'text-only fallback fixture', answers: { IMAGE_UX_REVIEW_SOURCE_IMAGES: ['test/fixtures/images/one-by-one.png'] } };
const inventory = await mod.hydrateImageUxScreenInventory(root, mod.buildImageUxScreenInventory(contract));
const generatedReviewLedger = mod.buildImageUxGeneratedReviewLedger(contract, inventory, {
  generated_review_images: [{
    id: 'text-only-review',
    source_screen_id: 'screen-1',
    text_only: true,
    status: 'text_only',
    mock: false,
    real_generated: false
  }]
});
const issueLedger = mod.buildImageUxIssueLedger(contract, generatedReviewLedger, null);
const gate = mod.defaultImageUxReviewGate(contract, { inventory, generatedReviewLedger, issueLedger });
assert.equal(gate.passed, false);
assert.ok(gate.blockers.includes('ux_review_text_only_fallback'));

console.log(JSON.stringify({ schema: 'sks.ux-review-no-text-fallback.v1', ok: true, blockers: gate.blockers }, null, 2));

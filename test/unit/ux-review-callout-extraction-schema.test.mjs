import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueLedgerFromGeneratedCallouts } from '../../dist/core/image-ux-review/callout-extraction.js';
import { realGeneratedReviewImage } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('callout extraction creates schema-valid issue rows from generated images', () => {
  const ledger = buildIssueLedgerFromGeneratedCallouts({
    passed: true,
    generated_review_images: [realGeneratedReviewImage()]
  });
  assert.equal(ledger.validation.ok, true);
  assert.equal(ledger.extracted_from_generated_callout, true);
  assert.equal(ledger.issues[0].source, 'real_gpt_image_2_callout');
  assert.equal(ledger.issues[0].extracted_from_generated_image, true);
});

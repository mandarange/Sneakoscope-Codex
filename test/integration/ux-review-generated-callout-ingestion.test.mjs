import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, realGeneratedReviewImage, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('UX-Review ingests generated gpt-image-2 callout metadata', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { contract, inventory } = await capturedInventory(imageUx, root, imagePath);
  const ledger = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory, { generated_review_images: [realGeneratedReviewImage()] }, { root });
  assert.equal(ledger.passed, true);
  assert.equal(ledger.generated_review_images[0].callout_extraction_required, true);
  assert.equal(ledger.generated_review_images[0].image_voxel_relation, 'generated_callout_review_of');
});

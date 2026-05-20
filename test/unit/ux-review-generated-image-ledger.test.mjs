import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, realGeneratedReviewImage, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('generated callout image ledger validates real gpt-image-2 evidence', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { contract, inventory } = await capturedInventory(imageUx, root, imagePath);
  const ledger = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory, { generated_review_images: [realGeneratedReviewImage()] });
  assert.equal(ledger.generated_count, 1);
  assert.equal(ledger.real_generated_count, 1);
  assert.equal(ledger.passed, true);
  assert.equal(ledger.generated_review_images[0].image_size_relation.coordinate_transform, 'identity');
});

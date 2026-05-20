import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, mockGeneratedReviewImage, realGeneratedReviewImage, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('UX-Review gate v2 passes only with real generated callout evidence and honest closeout', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { contract, inventory } = await capturedInventory(imageUx, root, imagePath);
  const generated = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory, { generated_review_images: [realGeneratedReviewImage()] });
  const issueLedger = imageUx.buildImageUxIssueLedger(contract, generated);
  const gate = imageUx.defaultImageUxReviewGate(contract, {
    inventory,
    generatedReviewLedger: generated,
    issueLedger,
    imageVoxelRelationsCreated: true,
    wrongnessChecked: true,
    honestModeComplete: true
  });
  assert.equal(gate.passed, true);

  const mockGenerated = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory, { generated_review_images: [mockGeneratedReviewImage()] });
  assert.equal(imageUx.defaultImageUxReviewGate(contract, { inventory, generatedReviewLedger: mockGenerated }).passed, false);
});

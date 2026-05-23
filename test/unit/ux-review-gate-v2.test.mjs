import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, mockGeneratedReviewImage, realGeneratedReviewImage, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('UX-Review gate v2 passes only with real generated callout evidence and honest closeout', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { contract, inventory } = await capturedInventory(imageUx, root, imagePath);
  const generated = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory, { generated_review_images: [realGeneratedReviewImage()] }, { root });
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

  const mockGenerated = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory, { generated_review_images: [mockGeneratedReviewImage()] }, { root });
  assert.equal(imageUx.defaultImageUxReviewGate(contract, { inventory, generatedReviewLedger: mockGenerated }).passed, false);
});

test('UX-Review gate v2 cannot pass full verification from generated-image metadata without file evidence', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { contract, inventory } = await capturedInventory(imageUx, root, imagePath);
  const generated = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory, {
    generated_review_images: [realGeneratedReviewImage({
      path: undefined,
      sha256: undefined,
      width: undefined,
      height: undefined
    })]
  }, { root });
  const issueLedger = imageUx.buildImageUxIssueLedger(contract, generated);
  const gate = imageUx.defaultImageUxReviewGate(contract, {
    inventory,
    generatedReviewLedger: generated,
    issueLedger,
    imageVoxelRelationsCreated: true,
    wrongnessChecked: true,
    honestModeComplete: true
  });

  assert.equal(generated.real_generated_count, 0);
  assert.equal(generated.passed, false);
  assert.ok(generated.blockers.includes('generated_review_image_missing'));
  assert.equal(gate.passed, false);
  assert.equal(gate.full_review_passed, false);
  assert.notEqual(gate.verified_level, 'verified');
});

test('UX-Review gate v2 allows reference-only partial closeout when generated image is unavailable', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { contract, inventory } = await capturedInventory(imageUx, root, imagePath);
  const generated = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory);
  const issueLedger = imageUx.buildImageUxIssueLedger(contract, generated);
  const gate = imageUx.defaultImageUxReviewGate(contract, {
    inventory,
    generatedReviewLedger: generated,
    issueLedger,
    imageVoxelReferenceAnchorCreated: true,
    wrongnessChecked: true,
    honestModeComplete: true
  });

  assert.equal(gate.passed, true);
  assert.equal(gate.status, 'verified_partial_reference');
  assert.equal(gate.verified_level, 'verified_partial');
  assert.equal(gate.full_review_passed, false);
  assert.equal(gate.reference_only, true);
  assert.equal(gate.gpt_image_2_callout_generated, false);
  assert.equal(gate.generated_image_ingested, false);
  assert.equal(gate.issue_ledger_from_generated_callout, false);
  assert.deepEqual(gate.blockers, []);
  assert.ok(gate.full_verification_blockers.includes('missing_generated_annotated_review_images'));
  assert.ok(gate.full_verification_blockers.includes('generated_review_image_missing'));
});

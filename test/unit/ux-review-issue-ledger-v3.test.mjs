import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, PNG_1X1_SHA256, realGeneratedReviewImage, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('UX issue ledger v3 carries extraction, bbox, status, and source fields', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { contract, inventory } = await capturedInventory(imageUx, root, imagePath);
  const generated = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory, { generated_review_images: [realGeneratedReviewImage()] }, { root });
  const ledger = imageUx.buildImageUxIssueLedger(contract, generated);
  const row = ledger.issues[0];
  assert.equal(ledger.schema_version, 3);
  assert.equal(row.generated_review_image_id, 'generated-review-real');
  assert.deepEqual(row.bbox, [0, 0, 1, 1]);
  assert.equal(row.status, 'fixed');
  assert.equal(row.source, 'real_gpt_image_2_callout');
  assert.equal(row.extraction_provider, 'codex_exec_resume_output_schema');
  assert.equal(row.extraction_schema, 'sks.image-ux-issue-ledger.v3');
  assert.equal(row.generated_image_sha256, PNG_1X1_SHA256);
  assert.equal(row.bbox_coordinate_space, 'generated_image');
  assert.equal(row.fix_verification_status, 'recheck_verified');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { imageUxReviewProofEvidence } from '../../dist/core/image-ux-review.js';

test('UX-Review proof evidence records generated images and blockers', () => {
  const evidence = imageUxReviewProofEvidence({ passed: false, blockers: ['ux_review_text_only_fallback'] }, {
    inventory: { source_screens: [{ id: 'screen-1' }] },
    generated_review_ledger: { generated_count: 1, real_generated_count: 0, generated_review_images: [] },
    issue_ledger: { validation: { ok: false }, blocking_issue_count: 1, issues: [] },
    recapture_plan: { changed_screens_rechecked_or_not_applicable: false }
  });
  assert.equal(evidence.status, 'verified_partial');
  assert.equal(evidence.generated_gpt_image_2_callout_images_count, 0);
  assert.ok(evidence.blockers.includes('ux_review_text_only_fallback'));
});

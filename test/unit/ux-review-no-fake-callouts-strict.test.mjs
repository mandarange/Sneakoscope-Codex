import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageUxGeneratedReviewLedger, buildImageUxIssueLedger } from '../../dist/core/image-ux-review.js';

test('non-mock generated images stay extraction-pending without real callouts', () => {
  const inventory = { source_screens: [{ id: 'screen-1', width: 100, height: 100, sha256: 'source' }] };
  const generated = buildImageUxGeneratedReviewLedger({}, inventory, {
    generated_review_images: [{ id: 'g1', path: 'g.png', width: 100, height: 100, sha256: 'generated', real_generated: true, mock: false }]
  });
  const issues = buildImageUxIssueLedger({}, generated);
  assert.equal(generated.generated_review_images[0].callout_extraction_status, 'pending');
  assert.equal(issues.passed, false);
  assert.match(issues.blockers.join(','), /callout_extraction_pending/);
});

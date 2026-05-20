import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecapturePlan } from '../../dist/core/image-ux-review/recapture.js';

test('recapture policy requires changed screen recheck after patch evidence', () => {
  const blocked = buildRecapturePlan({ recapture_required: true, changed_files: ['src/ui.tsx'] });
  assert.equal(blocked.passed, false);
  assert.ok(blocked.blockers.includes('manual_recapture_required'));
  const covered = buildRecapturePlan({ recapture_required: true, changed_files: ['src/ui.tsx'] }, { userScreenshot: 'after.png' });
  assert.equal(covered.passed, true);
  assert.equal(covered.gpt_image_2_re_review_required, true);
});

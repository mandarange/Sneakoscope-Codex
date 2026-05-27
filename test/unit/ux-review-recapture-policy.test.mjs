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

test('web UX recapture does not use Computer Use unless the target is explicitly native', () => {
  const webBlocked = buildRecapturePlan({ recapture_required: true, changed_files: ['src/ui.tsx'] }, { computerUseAvailable: true });
  assert.equal(webBlocked.passed, false);
  assert.equal(webBlocked.recapture_source, 'blocked');
  assert.ok(webBlocked.blockers.includes('web_recapture_requires_codex_chrome_extension_not_computer_use'));

  const nativeCovered = buildRecapturePlan({ recapture_required: true, changed_files: ['src/native.ts'] }, { computerUseAvailable: true, native: true });
  assert.equal(nativeCovered.passed, true);
  assert.equal(nativeCovered.recapture_source, 'codex_native_computer_use');
});

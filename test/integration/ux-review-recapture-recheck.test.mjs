import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecapturePlan } from '../../dist/core/image-ux-review/recapture.js';

test('UX-Review recapture/recheck can be satisfied by a user-provided after screenshot', () => {
  const recapture = buildRecapturePlan({ recapture_required: true, changed_files: ['src/ui.tsx'] }, {
    userScreenshot: 'after.png',
    recapturedSha256: 'a'.repeat(64),
    recapturedDimensions: { width: 100, height: 80 }
  });
  assert.equal(recapture.changed_screens_rechecked_or_not_applicable, true);
  assert.equal(recapture.output_schema_recheck_required, true);
});

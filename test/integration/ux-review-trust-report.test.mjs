import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrustReport } from '../../dist/core/trust-kernel/trust-report.js';

test('Trust Report downgrades mock gpt-image-2 fixture evidence', () => {
  const report = buildTrustReport({
    proof: {
      mission_id: 'M-fixture',
      route: '$Image-UX-Review',
      status: 'verified',
      evidence: { image_ux_review: { status: 'verified_partial', generated_images_total: 1, generated_gpt_image_2_callout_images_count: 0, blockers: [] } }
    },
    evidenceIndex: { status: 'verified', records: [] },
    contract: { validation: { ok: true, status: 'verified', issues: [] } }
  });
  assert.equal(report.status, 'verified_partial');
  assert.ok(report.issues.includes('mock_gpt_image_2_fixture_cannot_be_real_verified'));
});

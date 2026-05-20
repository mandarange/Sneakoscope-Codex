import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrustReport } from '../../dist/core/trust-kernel/trust-report.js';

test('UX-Review proof/trust packed path blocks mock-as-real', () => {
  const report = buildTrustReport({
    proof: { mission_id: 'M-packed', route: '$Image-UX-Review', status: 'verified', evidence: { image_ux_review: { generated_images_total: 1, generated_gpt_image_2_callout_images_count: 0, blockers: [] } } },
    evidenceIndex: { status: 'verified', records: [] },
    contract: { validation: { ok: true, status: 'verified', issues: [] } }
  });
  assert.equal(report.status, 'verified_partial');
});

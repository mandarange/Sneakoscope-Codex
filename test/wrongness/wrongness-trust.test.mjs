import assert from 'node:assert/strict';
import test from 'node:test';

test('active high-severity wrongness blocks verified trust status', async () => {
  const { buildTrustReport } = await import('../../dist/core/trust-kernel/trust-report.js');
  const proof = {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-trust',
    route: '$Team',
    status: 'verified',
    evidence: {
      wrongness: {
        active_count: 1,
        high_severity_active: 1,
        medium_severity_active: 0,
        active_ids: ['WRONG-trust'],
        records: [{ id: 'WRONG-trust', avoidance_rule: 'Do not overclaim trust.' }]
      }
    },
    claims: [],
    unverified: [],
    blockers: []
  };
  const report = buildTrustReport({
    proof,
    evidenceIndex: { status: 'verified', issues: [], records: [] },
    contract: { schema: 'sks.route-completion-contract.v1', required: { completion_proof: false }, validation: { ok: true, status: 'verified', issues: [] } }
  });
  assert.equal(report.status, 'blocked');
  assert.equal(report.ok, false);
  assert.ok(report.issues.includes('wrongness:active_high_severity_negative_evidence'));
});

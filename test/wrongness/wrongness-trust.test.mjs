import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

test('wrongness proof evidence blocks only route-relevant high severity records', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-route-'));
  const { addWrongnessRecord } = await import('../../dist/core/triwiki-wrongness/wrongness-ledger.js');
  const { wrongnessProofEvidence } = await import('../../dist/core/triwiki-wrongness/wrongness-proof-linker.js');
  await addWrongnessRecord(root, {
    route: '$UX-Review',
    wrongness_kind: 'trust_status_overclaim',
    severity: 'high',
    claim: { text: 'UX-Review scout gate was not passed.' },
    detected_by: { source: 'test', detail: 'scout_gate_not_passed' },
    root_cause: { category: 'unknown', explanation: 'fixture' },
    corrective_action: { summary: 'Fix UX-Review scout evidence.', required_evidence: ['trust-report.json'], patch_status: 'pending' },
    avoidance_rule: { id: 'avoid-trust-overclaim', text: 'Do not overclaim UX trust.', applies_to: ['$UX-Review'], severity: 'high' }
  });

  const wikiEvidence = await wrongnessProofEvidence(root, null, { route: '$Wiki' });
  assert.equal(wikiEvidence.high_severity_active, 0);
  assert.equal(wikiEvidence.global_high_severity_active, 1);
  assert.equal(wikiEvidence.ok, true);

  const uxEvidence = await wrongnessProofEvidence(root, null, { route: '$UX-Review' });
  assert.equal(uxEvidence.high_severity_active, 1);
  assert.equal(uxEvidence.ok, false);
});

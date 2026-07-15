import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteCompletionContract } from '../../dist/core/trust-kernel/route-contract.js';
import { validateCompletionContract } from '../../dist/core/trust-kernel/completion-contract.js';

test('route completion contract requires visual anchors for visual routes', () => {
  const proof = {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-visual',
    route: '$Image-UX-Review',
    execution_class: 'real',
    status: 'verified_partial',
    summary: {},
    evidence: {},
    claims: [],
    unverified: [],
    blockers: []
  };
  const contract = buildRouteCompletionContract(proof, { records: [] });
  assert.equal(contract.required.image_voxels, true);
  const validation = validateCompletionContract(contract, proof, { records: [] });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('image_voxel_anchor_missing'));
});

test('mock evidence cannot support a verified real route status', () => {
  const proof = {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-naruto',
    route: '$Naruto',
    execution_class: 'real',
    status: 'verified',
    summary: {},
    evidence: {},
    claims: [],
    unverified: [],
    blockers: []
  };
  const evidenceIndex = { status: 'verified_partial', records: [{ source: 'mock', trust: 'low' }] };
  const contract = buildRouteCompletionContract(proof, evidenceIndex);
  const validation = validateCompletionContract(contract, proof, evidenceIndex);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('mock_or_static_evidence_cannot_verify_real_status'));
});

test('problem-bearing completion contracts require root cause analysis', () => {
  const proof = {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-root-cause',
    route: '$Wiki',
    execution_class: 'real',
    status: 'verified_partial',
    summary: {},
    evidence: {},
    claims: [],
    unverified: ['fallback path used during route validation'],
    blockers: []
  };
  const contract = buildRouteCompletionContract(proof, { records: [] });
  assert.equal(contract.required.root_cause_analysis, true);
  const missing = validateCompletionContract(contract, proof, { records: [] });
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.includes('root_cause_analysis_missing'));

  const corrected = {
    ...proof,
    failure_analysis: {
      status: 'complete',
      root_cause: 'The fallback path remained available because route validation did not demand RCA evidence.',
      corrective_action: 'The completion contract now blocks problem-bearing proofs until RCA and corrective evidence are recorded.',
      evidence: ['src/core/proof/root-cause-policy.ts']
    }
  };
  const correctedContract = buildRouteCompletionContract(corrected, { records: [] });
  const validation = validateCompletionContract(correctedContract, corrected, { records: [] });
  assert.equal(validation.ok, true);
});

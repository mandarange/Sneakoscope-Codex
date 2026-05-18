import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteCompletionContract } from '../../src/core/trust-kernel/route-contract.mjs';
import { validateCompletionContract } from '../../src/core/trust-kernel/completion-contract.mjs';

test('route completion contract requires visual anchors for visual routes', () => {
  const proof = {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-visual',
    route: '$Image-UX-Review',
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
    mission_id: 'M-team',
    route: '$Team',
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

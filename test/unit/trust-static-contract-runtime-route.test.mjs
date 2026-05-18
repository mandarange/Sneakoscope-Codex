import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteCompletionContract } from '../../src/core/trust-kernel/route-contract.mjs';
import { validateCompletionContract } from '../../src/core/trust-kernel/completion-contract.mjs';

test('static_contract evidence cannot satisfy a runtime route contract', () => {
  const proof = {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-static-runtime',
    route: '$Team',
    status: 'verified_partial',
    summary: {},
    evidence: {},
    claims: [],
    unverified: ['static_contract route fixture'],
    blockers: []
  };
  const evidenceIndex = {
    status: 'verified_partial',
    records: [
      {
        source: 'static_contract',
        trust: 'low',
        kind: 'route_gate',
        path: '.sneakoscope/missions/M-static-runtime/team-gate.json'
      }
    ]
  };
  const contract = buildRouteCompletionContract(proof, evidenceIndex);
  const validation = validateCompletionContract(contract, proof, evidenceIndex);
  assert.equal(validation.ok, false);
  assert.equal(validation.status, 'blocked');
  assert.ok(validation.issues.includes('static_contract_evidence_for_runtime_route'));
});

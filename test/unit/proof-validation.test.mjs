import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCompletionProof } from '../../src/core/proof/proof-schema.mjs';
import { validateCompletionProof } from '../../src/core/proof/validation.mjs';
import { validateRouteCompletionProof } from '../../src/core/proof/route-proof-gate.mjs';

test('completion proof validation blocks failed status', () => {
  const proof = emptyCompletionProof({ route: '$Team', status: 'failed' });
  const validation = validateCompletionProof(proof);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('proof_failed'));
});

test('route proof gate requires proof for serious routes', async () => {
  const gate = await validateRouteCompletionProof(process.cwd(), {
    missionId: 'missing',
    route: '$Team',
    state: { proof_required: true }
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes('completion_proof_missing'));
});

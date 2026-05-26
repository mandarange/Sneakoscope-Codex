import test from 'node:test';
import assert from 'node:assert/strict';

test('fake vs real proof policy blocks fake evidence promoted as real', async () => {
  const mod = await import('../../dist/core/proof/fake-real-proof-policy.js');
  const report = mod.evaluateFakeRealProofPolicy({ backend: 'fake', real_parallel_claim: true });
  assert.equal(report.ok, false);
  assert.ok(report.blockers.includes('fake_backend_claimed_real_parallel'));
});

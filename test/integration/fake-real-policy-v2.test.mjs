import test from 'node:test';
import assert from 'node:assert/strict';

test('fake-real policy v2 reports subsystem proof levels', async () => {
  const mod = await import('../../dist/core/proof/fake-real-proof-policy.js');
  const report = mod.evaluateFakeRealProofPolicy({ backend: 'tmux', physical_tmux_verified: true, cleanup_proof: { ok: true }, work_graph_quality_score: 0.8 });
  assert.equal(report.subsystem_levels.tmux_physical, 'proven');
  assert.equal(report.subsystem_levels.cleanup, 'proven');
  assert.equal(report.subsystem_levels.work_graph, 'proven');
});

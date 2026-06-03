import test from 'node:test';
import assert from 'node:assert/strict';

test('fake-real proof policy v2 separates fixture-instrumented real and required missing', async () => {
  const mod = await import('../../dist/core/proof/fake-real-proof-policy.js');
  const fixtureReal = mod.evaluateFakeRealProofPolicy({
    backend: 'codex-sdk',
    real_parallel_claim: true,
    output_schema_used: true,
    output_last_message_path: 'result.json',
    fixture_instrumented_real: true
  });
  const requiredMissing = mod.evaluateFakeRealProofPolicy({
    backend: 'codex-sdk',
    real_parallel_claim: true,
    integration_optional: true,
    require_real_dynamic_agents: true
  });
  assert.equal(fixtureReal.proof_level, 'fixture_instrumented_real');
  assert.equal(fixtureReal.subsystem_levels.codex_dynamic, 'fixture_instrumented_real');
  assert.equal(fixtureReal.subsystems.warp_mad_lanes.proof_level, 'integration_optional');
  assert.equal(requiredMissing.proof_level, 'real_required_missing');
  assert.equal(requiredMissing.subsystem_levels.codex_dynamic, 'real_required_missing');
  assert.equal(requiredMissing.ok, false);
});

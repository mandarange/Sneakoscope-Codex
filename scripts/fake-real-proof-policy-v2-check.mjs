#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/proof/fake-real-proof-policy.js');
const fixtureReal = mod.evaluateFakeRealProofPolicy({
  backend: 'codex-exec',
  real_parallel_claim: true,
  output_schema_used: true,
  output_last_message_path: 'result.json',
  fixture_instrumented_real: true,
  work_graph_quality_score: 0.8,
  cleanup_proof: { ok: true }
});
const requiredMissing = mod.evaluateFakeRealProofPolicy({
  backend: 'codex-exec',
  real_parallel_claim: true,
  integration_optional: true,
  require_real_dynamic_agents: true
});
const zellij = mod.evaluateFakeRealProofPolicy({ backend: 'zellij', zellij_pane_verified: true, work_graph_quality_score: 0.8, cleanup_proof: { ok: true } });

assertGate(fixtureReal.proof_level === 'fixture_instrumented_real', 'fixture-instrumented real smoke must not be plain proven', fixtureReal);
assertGate(requiredMissing.proof_level === 'real_required_missing' && requiredMissing.ok === false, 'required missing real runtime must block', requiredMissing);
assertGate(zellij.subsystem_levels.zellij_pane === 'proven', 'real Zellij pane proof must be subsystem-proven', zellij);
assertGate(zellij.subsystem_levels.cleanup === 'proven', 'cleanup proof level must be included', zellij);
assertGate(zellij.subsystem_levels.work_graph === 'proven', 'work graph proof level must be included', zellij);
emitGate('proof:fake-real-policy-v2', { fixture_real: fixtureReal.proof_level, required_missing: requiredMissing.proof_level });

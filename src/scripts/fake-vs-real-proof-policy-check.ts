#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/proof/fake-real-proof-policy.js');
const fake = mod.evaluateFakeRealProofPolicy({ backend: 'fake', real_parallel_claim: false });
assertGate(fake.ok === true && fake.proof_level === 'fixture_only', 'fake backend must be fixture_only', fake);
const badFake = mod.evaluateFakeRealProofPolicy({ backend: 'fake', real_parallel_claim: true });
assertGate(badFake.ok === false && badFake.blockers.includes('fake_backend_claimed_real_parallel'), 'fake backend cannot claim real parallel', badFake);
const zellij = mod.evaluateFakeRealProofPolicy({ backend: 'zellij', zellij_pane_verified: true });
assertGate(zellij.ok === true && zellij.proof_level === 'proven', 'real Zellij with pane evidence must be proven', zellij);
const optional = mod.evaluateFakeRealProofPolicy({ backend: 'codex-sdk', real_parallel_claim: true, integration_optional: true });
assertGate(optional.ok === true && optional.proof_level === 'integration_optional', 'unavailable real smoke must be integration_optional', optional);
emitGate('proof:fake-vs-real-policy', { fake: fake.proof_level, zellij: zellij.proof_level, optional: optional.proof_level });

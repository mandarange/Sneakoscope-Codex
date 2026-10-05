import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIntentContract } from '../intent-contract.js';

function build(overrides: Partial<Parameters<typeof buildIntentContract>[0]> = {}) {
  return buildIntentContract({
    naturalLanguageEffect: 'Inspect security and delete policy without changing files.',
    effect: 'read', canonicalCommand: 'sks review', targetHashes: ['a'.repeat(64)],
    policyVersion: 'policy-v1', runtimeSnapshot: 'desktop-bridge', evidenceState: 'valid', ...overrides
  });
}

test('actual effect outranks risky nouns, light commands, and force', () => {
  assert.equal(build().risk, 'FAST');
  assert.equal(build({ effect: 'delete', canonicalCommand: 'sks check', force: true }).risk, 'HEAVY');
  assert.equal(build({ effect: 'auth', requestedRisk: 'FAST' }).risk, 'HEAVY');
  assert.equal(build({ requestedRisk: 'HEAVY' }).risk, 'HEAVY');
  assert.throws(() => build({ requestedRisk: 'ULTRA' }), /explicit_opt_in/);
  assert.equal(build({ requestedRisk: 'ULTRA', explicitUltraOptIn: true }).risk, 'ULTRA');
});

test('contracts are deeply immutable, normalized and stable across replay', () => {
  const first = build({ observedChangedPaths: ['./src/b.ts', 'src/a.ts'] });
  const second = build({ observedChangedPaths: ['src/a.ts', 'src/b.ts'] });
  assert.equal(first.contract_hash, second.contract_hash);
  assert.equal(Object.isFrozen(first.observed_changed_paths), true);
  assert.throws(() => (first.observed_changed_paths as string[]).push('src/c.ts'));
});


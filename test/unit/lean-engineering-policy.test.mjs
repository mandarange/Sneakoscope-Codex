import test from 'node:test';
import assert from 'node:assert/strict';

test('lean engineering policy normalizes and validates decisions', async () => {
  const mod = await import('../../dist/core/lean-engineering-policy.js');
  const decision = mod.normalizeLeanDecision({
    selected_rung: 'stdlib',
    task_requires_change: true,
    verification_minimum: ['node --test']
  });
  assert.equal(decision.schema, 'sks.lean-decision.v1');
  assert.equal(decision.policy_id, 'sks.lean-engineering-policy.v1');
  assert.equal(decision.selected_rung, 'stdlib');
  assert.equal(mod.validateLeanDecision(decision).ok, true);
});

test('lean engineering policy rejects unsupported fallback evidence', async () => {
  const mod = await import('../../dist/core/lean-engineering-policy.js');
  const decision = mod.normalizeLeanDecision({
    selected_rung: 'minimal-custom',
    task_requires_change: true,
    verification_minimum: ['npm run build'],
    fallback_plan: { kind: 'compatibility' }
  });
  const validation = mod.validateLeanDecision(decision);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('fallback_plan.evidence'));
});

test('lean simplification marker parser requires trigger and upgrade path', async () => {
  const mod = await import('../../dist/core/lean-engineering-policy.js');
  const complete = mod.parseLeanSimplificationMarkerLine('// sks-lean: ceiling=one provider; revisit_when=second provider ships; upgrade=extract provider map', 'src/x.ts', 4);
  assert.equal(complete.status, 'complete');
  const missing = mod.parseLeanSimplificationMarkerLine('// sks-lean: ceiling=local only', 'src/y.ts', 7);
  assert.equal(missing.status, 'missing-trigger');
});

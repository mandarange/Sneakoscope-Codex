import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

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

test('core engineering directive has one exact text and a matching evidence hash', async () => {
  const mod = await import('../../dist/core/lean-engineering-policy.js');
  const expectedLines = [
    'Core Engineering Directive:',
    'Build for the stated goal. Make the smallest sufficient change. Test the main path, meaningful boundaries, and credible failures; do not manufacture low-value test matrices.',
    'Follow reality. Trace actual callers, inputs, data, and control flow; do not add defenses for unreachable or speculative conditions.',
    'Use the real project mechanism. Follow current code and specifications and use authoritative tools or data; never substitute invented mocks, guessed heuristics, remembered architectures, or unsupported fallbacks.',
    'Preserve security, permissions, data integrity, rollback, accessibility, and explicit user requirements. If the real path is unavailable, stop and report evidence.'
  ];
  const directive = mod.coreEngineeringDirectiveText();
  assert.equal(directive, expectedLines.join('\n'));
  assert.equal(mod.leanEngineeringCompactText(), directive);
  assert.equal(mod.leanEngineeringLongText(), directive);
  assert.equal(
    mod.CORE_ENGINEERING_DIRECTIVE_HASH,
    createHash('sha256').update(expectedLines.slice(1).join('\n')).digest('hex').slice(0, 16)
  );
  assert.match(mod.coreEngineeringDirectiveReferenceText(), new RegExp(`${mod.CORE_ENGINEERING_DIRECTIVE_ID}/${mod.CORE_ENGINEERING_DIRECTIVE_HASH}`));
});

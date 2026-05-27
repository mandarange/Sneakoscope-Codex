import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStrategy } from '../../dist/core/strategy/strategy-compiler.js';
import { evaluateStrategyGate } from '../../dist/core/strategy/strategy-gate.js';

test('strategy gate allows scheduler only after strategy artifacts pass', () => {
  const compiled = compileStrategy({ prompt: 'Patch `src/core/version.ts`.', writeTargets: ['src/core/version.ts'] });
  const gate = evaluateStrategyGate({ compiled, writeCapable: true });
  assert.equal(gate.ok, true);
  assert.equal(gate.strategy_first_required, true);
  assert.equal(gate.scheduler_allowed, true);
});

test('strategy gate blocks visual work when Appshots evidence is missing', () => {
  const compiled = compileStrategy({ prompt: 'Patch docs after visual Appshots UI review.', visualRequired: true });
  const gate = evaluateStrategyGate({ compiled, writeCapable: true, visualRequired: true, appshotsOk: false, sourceIntelligenceOk: false });
  assert.equal(gate.ok, false);
  assert.equal(gate.scheduler_allowed, false);
  assert.match(gate.blockers.join('\n'), /appshots_operator_action_missing_for_visual_proof/);
});

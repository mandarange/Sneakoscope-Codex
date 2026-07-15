import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelinePlan } from '../../dist/core/pipeline.js';
import { routePrompt } from '../../dist/core/routes.js';

test('explicit Naruto route uses official subagent stages without legacy five-agent intake', () => {
  const plan = buildPipelinePlan({ route: routePrompt('$Naruto'), task: 'implement fixture' });
  assert.equal(plan.stages.some((row) => row.id === 'native_agent_intake'), false);
  assert.ok(plan.stages.some((row) => row.id === 'subagent_plan'));
  assert.ok(plan.stages.some((row) => row.id === 'official_subagent_execution'));
  assert.ok(plan.stages.some((row) => row.id === 'parent_integration'));
  assert.equal(plan.route.subagents_required, true);
  assert.equal(plan.route.native_sessions_required, false);
  assert.equal(plan.agent_intake.required, false);
  assert.equal(plan.lean_decision.schema, 'sks.lean-decision.v1');
  assert.equal(plan.lean_decision.policy_id, 'sks.lean-engineering-policy.v1');
  assert.equal(plan.lean_decision.selected_rung, 'minimal-custom');
  assert.ok(plan.lean_decision.verification_minimum.length > 0);
});

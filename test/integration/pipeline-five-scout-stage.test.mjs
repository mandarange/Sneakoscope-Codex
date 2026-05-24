import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelinePlan } from '../../src/core/pipeline.mjs';
import { routePrompt } from '../../src/core/routes.mjs';

test('serious route pipeline includes native_agent_intake stage', () => {
  const plan = buildPipelinePlan({ route: routePrompt('$Team'), task: 'implement fixture' });
  const stage = plan.stages.find((row) => row.id === 'native_agent_intake');
  assert.ok(stage);
  assert.equal(stage.status, 'required');
  assert.equal(stage.agent_count, 5);
  assert.equal(stage.read_only, true);
  assert.ok(plan.agent_intake.required);
});

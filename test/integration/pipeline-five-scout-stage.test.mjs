import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelinePlan } from '../../src/core/pipeline.mjs';
import { routePrompt } from '../../src/core/routes.mjs';

test('serious route pipeline includes five_scout_parallel_intake stage', () => {
  const plan = buildPipelinePlan({ route: routePrompt('$Team'), task: 'implement fixture' });
  const stage = plan.stages.find((row) => row.id === 'five_scout_parallel_intake');
  assert.ok(stage);
  assert.equal(stage.status, 'required');
  assert.equal(stage.scout_count, 5);
  assert.equal(stage.read_only, true);
  assert.ok(plan.scout_intake.required);
});

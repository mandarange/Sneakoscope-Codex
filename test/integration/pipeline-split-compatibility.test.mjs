import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelinePlan as facadePlan } from '../../src/core/pipeline.mjs';
import { buildPipelinePlan as splitPlan } from '../../src/core/pipeline/pipeline-plan-writer.mjs';

test('pipeline facade and split module exports stay compatible', () => {
  const a = facadePlan({ task: '$Team fixture' });
  const b = splitPlan({ task: '$Team fixture' });
  assert.equal(a.route.command, b.route.command);
  assert.equal(a.scout_intake.required, b.scout_intake.required);
});

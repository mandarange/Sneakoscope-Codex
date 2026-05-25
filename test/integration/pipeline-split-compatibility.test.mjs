import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelinePlan as facadePlan } from '../../dist/core/pipeline.js';
import { buildPipelinePlan as splitPlan } from '../../dist/core/pipeline/pipeline-plan-writer.js';

test('pipeline facade and split module exports stay compatible', () => {
  const a = facadePlan({ task: '$Team fixture' });
  const b = splitPlan({ task: '$Team fixture' });
  assert.equal(a.route.command, b.route.command);
  assert.equal(a.agent_intake.required, b.agent_intake.required);
});

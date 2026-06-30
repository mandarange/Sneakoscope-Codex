import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_INTAKE_STAGE_ID, DEFAULT_AGENT_COUNT } from '../../dist/core/agents/agent-schema.js';
import { agentPipelineStage, normalizeAgentPolicy, routeRequiresAgentIntake } from '../../dist/core/agents/agent-plan.js';

test('native agent policy is required for serious routes', () => {
  assert.equal(routeRequiresAgentIntake('$Team', { task: 'implement feature' }), true);
  assert.equal(routeRequiresAgentIntake('$Research', { task: 'investigate mechanism' }), true);
  assert.equal(routeRequiresAgentIntake('$DFix', { task: 'tiny copy edit' }), false);
  const policy = normalizeAgentPolicy('$Team', 'implement feature', {});
  assert.equal(policy.stage_id, AGENT_INTAKE_STAGE_ID);
  assert.equal(policy.agent_count, DEFAULT_AGENT_COUNT);
  assert.equal(policy.backend, 'native-agent-kernel');
});

test('agent pipeline stage declares native backend and proof outputs', () => {
  const stage = agentPipelineStage(normalizeAgentPolicy('$Team', 'fixture', {}));
  assert.equal(stage.id, 'native_agent_intake');
  assert.equal(stage.backend, 'native-agent-kernel');
  assert.equal(stage.read_only, false);
  assert.match(stage.write_policy, /bounded workspace-write/);
  assert.ok(stage.outputs.includes('agents/agent-proof-evidence.json'));
});

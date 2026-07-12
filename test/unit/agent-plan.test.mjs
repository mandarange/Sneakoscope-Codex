import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_INTAKE_STAGE_ID, DEFAULT_NARUTO_REQUESTED_SUBAGENTS } from '../../dist/core/agents/agent-schema.js';
import { agentPipelineStage, normalizeAgentPolicy, routeRequiresAgentIntake } from '../../dist/core/agents/agent-plan.js';
import { routePrompt } from '../../dist/core/routes.js';

test('official subagent policy is explicit and task-profile aware', () => {
  assert.equal(routeRequiresAgentIntake('$Team', { task: 'implement feature' }), true);
  assert.equal(routeRequiresAgentIntake('$Research', { task: 'investigate mechanism' }), false);
  assert.equal(routeRequiresAgentIntake('$DFix', { task: 'tiny copy edit' }), false);
  assert.equal(routeRequiresAgentIntake(routePrompt('work on the parser'), { task: 'work on the parser' }), false);
  assert.equal(routeRequiresAgentIntake(routePrompt('$Work'), { task: '$Work' }), true);
  const policy = normalizeAgentPolicy('$Team', 'implement feature', {});
  assert.equal(policy.stage_id, AGENT_INTAKE_STAGE_ID);
  assert.equal(policy.requested_subagents, DEFAULT_NARUTO_REQUESTED_SUBAGENTS);
  assert.equal(policy.backend, 'official-codex-subagent');
});

test('agent pipeline stage declares official thread budget and event evidence', () => {
  const stage = agentPipelineStage(normalizeAgentPolicy('$Team', 'fixture', {}));
  assert.equal(stage.id, 'native_agent_intake');
  assert.equal(stage.backend, 'official-codex-subagent');
  assert.equal(stage.max_threads, 12);
  assert.equal(stage.max_depth, 1);
  assert.equal(stage.read_only, false);
  assert.match(stage.write_policy, /bounded workspace-write/);
  assert.ok(stage.outputs.includes('subagent-evidence.json'));
  assert.ok(stage.outputs.includes('subagent-parent-summary.json'));
  assert.equal(stage.outputs.includes('verification-summary.json'), false);
});

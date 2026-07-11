import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelinePlan } from '../pipeline-internals/runtime-core.js';
import { routePrompt, subagentExecutionPolicyText } from '../routes.js';

test('Naruto plan emits one native intake stage and only runnable command surfaces', () => {
  const missionId = 'M-20260711-test';
  const plan: any = buildPipelinePlan({
    route: routePrompt('$Naruto'),
    task: 'implement and verify the tool recovery flow',
    missionId,
    ambiguity: { required: true, auto_sealed: true }
  });

  const nativeStages = plan.stages.filter((stage: any) => stage.id === 'native_agent_intake');
  assert.equal(nativeStages.length, 1);
  assert.equal(nativeStages[0].status, 'required');
  assert.equal(plan.ambiguity_gate.status, 'auto_sealed');

  const actions = plan.next_actions.join('\n');
  assert.match(actions, /sks agent run --mission 'M-20260711-test' --route '\$Naruto' --agents 5 --json/);
  assert.doesNotMatch(actions, /--route "\$Naruto"/);
  assert.doesNotMatch(actions, /sks agents\b/);

  assert.ok(plan.verification.includes('sks selftest --mock --json'));
  assert.ok(!plan.verification.some((command: string) => /npm run selftest/.test(command)));
});

test('native-session policy trusts callable turn tools before declaring a blocker', () => {
  const text = subagentExecutionPolicyText(routePrompt('$Naruto'), 'implement the repair');
  assert.match(text, /callable tool manifest/i);
  assert.match(text, /functions\.exec/);
  assert.match(text, /functions\.collaboration\.spawn_agent/);
  assert.match(text, /never report those tools unavailable/i);
});

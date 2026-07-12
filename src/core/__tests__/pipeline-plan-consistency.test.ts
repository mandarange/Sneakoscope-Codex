import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelinePlan } from '../pipeline-internals/runtime-core.js';
import { routePrompt, subagentExecutionPolicyText } from '../routes.js';

test('Naruto plan uses canonical official subagent stages without legacy intake commands', () => {
  const missionId = 'M-20260711-test';
  const plan: any = buildPipelinePlan({
    route: routePrompt('$Naruto'),
    task: 'implement and verify the tool recovery flow',
    missionId,
    ambiguity: { required: true, auto_sealed: true }
  });

  assert.equal(plan.stages.filter((stage: any) => stage.id === 'native_agent_intake').length, 0);
  assert.ok(plan.stages.some((stage: any) => stage.id === 'subagent_plan'));
  assert.ok(plan.stages.some((stage: any) => stage.id === 'official_subagent_execution'));
  assert.ok(plan.stages.some((stage: any) => stage.id === 'parent_integration'));
  assert.equal(plan.ambiguity_gate.status, 'auto_sealed');
  assert.equal(plan.route.subagents_required, true);
  assert.equal(plan.route.native_sessions_required, false);

  const actions = plan.next_actions.join('\n');
  assert.match(actions, /read subagent-plan\.json/i);
  assert.match(actions, /official Codex subagent workflow/i);
  assert.doesNotMatch(actions, /sks agent run|clone roster|verification DAG/i);

  assert.equal(plan.verification_budget, 'affected');
  assert.ok(plan.verification.some((command: string) => /official subagent evidence/i.test(command)));
  assert.ok(!plan.verification.some((command: string) => /packcheck|selftest/i.test(command)));
});

test('specialized parallel routes use one official subagent fanout without legacy intake', () => {
  for (const task of [
    '$DB --agents 2 audit all schemas in parallel',
    '$PPT --agents 3 build independent slide sections in parallel'
  ]) {
    const plan: any = buildPipelinePlan({ route: routePrompt(task), task });
    assert.equal(plan.route.subagents_required, true, task);
    assert.equal(plan.agent_intake.required, false, task);
    assert.equal(plan.agent_intake.subagents_required, false, task);
    assert.equal(plan.stages.filter((stage: any) => stage.id === 'native_agent_intake').length, 0, task);
    assert.equal(plan.stages.filter((stage: any) => stage.id === 'official_subagent_execution').length, 1, task);
    assert.doesNotMatch(plan.next_actions.join('\n'), /sks agent run/i, task);
  }
});

test('implicit bounded Naruto routing does not create a default six-agent intake', () => {
  for (const task of ['work on the parser', '로그인 버그 수정해줘', 'Implement the route parser']) {
    const routed: any = routePrompt(task);
    assert.equal(routed.explicit_invocation, false, task);
    const plan: any = buildPipelinePlan({ route: routed, task });
    assert.equal(plan.route.subagents_required, false, task);
    assert.equal(plan.agent_intake.required, false, task);
    assert.equal(plan.agent_intake.requested_subagents, 0, task);
    assert.equal(plan.stages.some((stage: any) => stage.id === 'native_agent_intake'), false, task);
  }

  const explicitWorkRoute: any = routePrompt('$Work');
  assert.equal(explicitWorkRoute.explicit_invocation, true);
  const explicitWork: any = buildPipelinePlan({ route: explicitWorkRoute, task: '$Work' });
  assert.equal(explicitWork.route.subagents_required, true);
  assert.equal(explicitWork.agent_intake.required, false);
  assert.equal(explicitWork.stages.some((stage: any) => stage.id === 'native_agent_intake'), false);
});

test('subagent policy uses official natural-language delegation without unstable tool contracts', () => {
  const text = subagentExecutionPolicyText(routePrompt('$Naruto'), 'implement the repair');
  assert.match(text, /Codex subagent workflow/i);
  assert.match(text, /SubagentStart\/SubagentStop/i);
  assert.match(text, /wait for all requested agent threads/i);
  assert.doesNotMatch(text, /functions\.exec|functions\.collaboration\.spawn_agent|native multi-session/i);
});

test('pipeline gate and verification budgets follow the task profile', () => {
  const cases = [
    { task: 'hi', gate: 'none', limit: 0, verification: 'none' },
    { task: 'README 오타 고쳐줘', gate: 'minimal', limit: 1, verification: 'single-check' },
    { task: '로그인 버그 수정해줘', gate: 'scoped', limit: 2, verification: 'affected' },
    { task: '여러 패키지를 병렬 검토해줘', gate: 'scoped', limit: 2, verification: 'affected' },
    { task: 'Edit multiple files in parallel', gate: 'scoped', limit: 3, verification: 'affected' },
    { task: 'Fix the database migration', gate: 'full', limit: 4, verification: 'confidence' }
  ];
  for (const row of cases) {
    const plan: any = buildPipelinePlan({ route: routePrompt(row.task), task: row.task });
    assert.equal(plan.gate_profile, row.gate, row.task);
    assert.equal(plan.gate_budget.blocking_gate_limit, row.limit, row.task);
    assert.equal(plan.verification_budget, row.verification, row.task);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { consultJevToolDelegation, setDecisionTestOverrides } from '../integration.js';
import { defaultDecisionConfig } from '../config.js';
import { compileDecision } from '../policy.js';
import { buildDecisionBundle } from '../questions.js';

process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';

const ENV = { OPENROUTER_API_KEY: 'sk-or-test-tooldelegationaaaaaaa', HOME: process.env.HOME, PATH: process.env.PATH };

function enabledConfig() {
  return { ...defaultDecisionConfig(), mode: 'jev' as const, consentCloud: true };
}

function delegationBundle() {
  return buildDecisionBundle({
    projectId: 'p'.repeat(32),
    workflowRunId: 'delegation',
    workflowRevision: 'delegation',
    sourceDigest: 'd',
    graphDigest: null,
    goal: 'Implement the login parser fix across the auth package.',
    delegationCandidate: { toolName: 'apply_patch', targets: ['src/auth/parser.ts'], missionGoal: 'Implement the login parser fix.' }
  });
}

test('the delegation bundle carries one independent choice bound to state.delegation', () => {
  const bundle = delegationBundle();
  assert.deepEqual(Object.keys(bundle.request.questions), ['delegation']);
  assert.deepEqual(bundle.questionBindings.delegation, { kind: 'delegation' });
  const question = bundle.request.questions.delegation;
  assert.ok(question);
  assert.equal(question?.type, 'choice');
  assert.deepEqual(Object.keys(question?.type === 'choice' ? question.criteria : {}).sort(), ['delegate_child', 'keep_baseline', 'parent_owned']);
  const state = bundle.request.state as { delegation: { tool: string; targets: string[]; mission_goal: string } };
  assert.equal(state.delegation.tool, 'apply_patch');
  assert.deepEqual(state.delegation.targets, ['src/auth/parser.ts']);
  assert.equal(bundle.delegationCandidate?.toolName, 'apply_patch');
});

test('compileDecision maps a confident delegation choice to select_delegation and keeps baseline otherwise', () => {
  const bundle = delegationBundle();
  const confident = compileDecision(bundle, {
    model: 'typesafe/jev-1.13',
    answers: {
      delegation: { type: 'choice', choice: 'parent_owned', confidence: 0.9, probabilities: { delegate_child: 0.05, parent_owned: 0.9, keep_baseline: 0.05 } }
    },
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  assert.equal(confident.kind, 'apply');
  assert.deepEqual(confident.kind === 'apply' ? confident.effects : [], [{ kind: 'select_delegation', choice: 'parent_owned' }]);

  const uncertain = compileDecision(bundle, {
    model: 'typesafe/jev-1.13',
    answers: {
      delegation: { type: 'choice', choice: 'parent_owned', confidence: 0.9, probabilities: { delegate_child: 0.45, parent_owned: 0.5, keep_baseline: 0.05 } }
    },
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  assert.equal(uncertain.kind, 'keep_baseline');
  assert.equal(uncertain.kind === 'keep_baseline' ? uncertain.reason : '', 'uncertain');

  const baseline = compileDecision(bundle, {
    model: 'typesafe/jev-1.13',
    answers: { delegation: { type: 'choice', choice: 'keep_baseline', confidence: 0.9, probabilities: { delegate_child: 0.05, parent_owned: 0.05, keep_baseline: 0.9 } } },
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  assert.equal(baseline.kind, 'keep_baseline');
  assert.equal(baseline.kind === 'keep_baseline' ? baseline.reason : '', 'keep_baseline_selected');

  const foreign = compileDecision(bundle, {
    model: 'typesafe/jev-1.13',
    answers: { delegation: { type: 'choice', choice: 'gpt-6-astra', confidence: 0.9, probabilities: { delegate_child: 0.05, parent_owned: 0.05, keep_baseline: 0.9 } } },
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  assert.equal(foreign.kind, 'keep_baseline');
});

test('consultJevToolDelegation stays silent when Jev is off and returns the choice when confident', async () => {
  let fetched = 0;
  setDecisionTestOverrides({
    config: defaultDecisionConfig(),
    fetchImpl: async () => {
      fetched += 1;
      return new Response('{}', { status: 500 });
    }
  });
  try {
    const off = await consultJevToolDelegation({ root: process.cwd(), missionGoal: 'goal', toolName: 'apply_patch', targets: ['a.ts'], env: ENV });
    assert.deepEqual(off, { called: false, choice: null, reason: 'off' });
    assert.equal(fetched, 0);
  } finally {
    setDecisionTestOverrides(null);
  }

  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async () => {
      fetched += 1;
      return new Response(JSON.stringify({
        model: 'typesafe/jev-1.13',
        answers: {
          delegation: { type: 'choice', choice: 'delegate_child', confidence: 0.95, probabilities: { delegate_child: 0.93, parent_owned: 0.04, keep_baseline: 0.03 } }
        },
        usage: { input_tokens: 10, output_tokens: 2 }
      }), { status: 200 });
    }
  });
  try {
    const on = await consultJevToolDelegation({ root: process.cwd(), missionGoal: 'goal', toolName: 'apply_patch', targets: ['src/x.ts'], env: ENV });
    assert.equal(fetched, 1);
    assert.deepEqual(on, { called: true, choice: 'delegate_child', reason: 'applied' });
    const empty = await consultJevToolDelegation({ root: process.cwd(), missionGoal: '', toolName: 'apply_patch', targets: [], env: ENV });
    assert.equal(empty.called, false);
    assert.equal(empty.reason, 'empty_candidate');
  } finally {
    setDecisionTestOverrides(null);
  }
});

test('a transport failure is reported as called without a choice', async () => {
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async () => new Response('{"error":"down"}', { status: 503 })
  });
  try {
    const result = await consultJevToolDelegation({ root: process.cwd(), missionGoal: 'goal', toolName: 'Write', targets: ['b.ts'], env: ENV });
    assert.equal(result.called, true);
    assert.equal(result.choice, null);
    assert.equal(result.reason, 'transport_error');
  } finally {
    setDecisionTestOverrides(null);
  }
});

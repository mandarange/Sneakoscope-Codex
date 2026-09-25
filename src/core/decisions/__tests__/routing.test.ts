import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecision } from '../policy.js';
import { buildDecisionBundle } from '../questions.js';
import '../../__tests__/helpers/isolated-test-home.js';
import { applySealedRouting, assembleRoutingSelection, buildRoutingCandidates, MAX_JEV_ROUTING_ROLES } from '../routing.js';
import { ROUTING_TIERS, type DecisionsWireResponse } from '../types.js';
import { BUILTIN_LATEST_TIER_MODELS, resetLatestModelTierCache } from '../../subagents/model-tiers.js';

const USAGE = { input_tokens: 20, output_tokens: 4 };

function bundleFor(roles: { id: string; summary: string }[]) {
  return buildDecisionBundle({
    projectId: 'p',
    workflowRunId: 'w',
    workflowRevision: 'r',
    sourceDigest: 'source',
    graphDigest: null,
    goal: 'Rename one label and search the repository.',
    routingCandidates: roles
  });
}

function choice(selected: string, keys: string[]) {
  const others = keys.filter((key) => key !== selected);
  const share = (1 - 0.9) / others.length;
  const probabilities = Object.fromEntries(keys.map((key) => [key, key === selected ? 0.9 : share]));
  return { type: 'choice' as const, choice: selected, confidence: 0.91, probabilities };
}

function response(answers: DecisionsWireResponse['answers']): DecisionsWireResponse {
  return { model: 'typesafe/jev-1.13', answers, usage: USAGE };
}

test('routing candidates keep dynamic sealed role ids and cap the fan-out', () => {
  const roles = buildRoutingCandidates({
    roles: [
      { name: 'Explorer', dynamic: true, summary: 'bad id' },
      { name: 'worker', dynamic: false, summary: 'static' },
      { name: 'worker', dynamic: true, summary: 'first' },
      { name: 'worker', dynamic: true, summary: 'duplicate' },
      ...Array.from({ length: 12 }, (_, index) => ({
        name: `role_${index}`,
        dynamic: true,
        summary: `role ${index}`
      }))
    ]
  });
  assert.equal(roles[0]?.id, 'worker');
  assert.equal(roles.length, MAX_JEV_ROUTING_ROLES);
  assert.equal(roles.some((role) => role.id === 'Explorer'), false);
});

test('one Decisions request asks tier, difficulty, and risk for each role', () => {
  const bundle = bundleFor([
    { id: 'worker', summary: 'Rename one label.' },
    { id: 'explorer', summary: 'Search callers.' }
  ]);
  assert.equal(bundle.request.questions.route_worker?.type, 'choice');
  assert.equal(bundle.request.questions.difficulty_worker?.type, 'score');
  assert.equal(bundle.request.questions.risk_worker?.type, 'noul');
  assert.equal(bundle.request.questions.needed_worker?.type, 'noul');
  assert.equal(bundle.request.questions.route_explorer?.type, 'choice');
  assert.equal(Object.keys(bundle.request.questions).length, 8);
  const criteria = bundle.request.questions.route_worker;
  assert.equal(criteria?.type, 'choice');
  if (criteria?.type === 'choice') {
    // Jev chooses among tiers, never among pinned model names.
    assert.deepEqual(Object.keys(criteria.criteria).sort(), [...ROUTING_TIERS.map((tier) => tier.id), 'keep_baseline'].sort());
    assert.equal(Object.keys(criteria.criteria).some((key) => key.startsWith('gpt-')), false);
  }
});

test('a confident fast choice stays fast, and difficulty or risk escalates to the deep tier', () => {
  const bundle = bundleFor([
    { id: 'worker', summary: 'Rename one label.' },
    { id: 'explorer', summary: 'Search callers.' },
    { id: 'security_reviewer', summary: 'Review auth changes.' }
  ]);
  const keys = Object.keys(bundle.request.questions.route_worker && bundle.request.questions.route_worker.type === 'choice'
    ? bundle.request.questions.route_worker.criteria
    : {});
  const compiled = compileDecision(bundle, response({
    route_worker: choice('fast', keys),
    difficulty_worker: { type: 'score', score: 0, confidence: 0.9 },
    risk_worker: { type: 'noul', noul: 0.05 },
    route_explorer: choice('context', keys),
    difficulty_explorer: { type: 'score', score: 3, confidence: 0.9 },
    risk_explorer: { type: 'noul', noul: 0.05 },
    route_security_reviewer: choice('fast', keys),
    difficulty_security_reviewer: { type: 'score', score: 0, confidence: 0.9 },
    risk_security_reviewer: { type: 'noul', noul: 0.91 }
  }));
  assert.equal(compiled.kind, 'apply');
  if (compiled.kind !== 'apply') return;
  const tiers = Object.fromEntries(compiled.effects.flatMap((effect) => (
    effect.kind === 'select_routing' ? [[effect.roleId, effect.tier]] : []
  )));
  assert.deepEqual(tiers, { worker: 'fast', explorer: 'deep', security_reviewer: 'deep' });
});

test('assembled routing resolves each tier to its newest model, and a model-name answer is rejected', () => {
  resetLatestModelTierCache();
  const selected = assembleRoutingSelection([
    { roleId: 'worker', tier: 'fast' },
    { roleId: 'implementer', tier: 'balanced' },
    { roleId: 'explorer', tier: 'context' },
    { roleId: 'reviewer', tier: 'deep' }
  ]);
  // No Codex models cache in the isolated HOME: the built-in latest family.
  assert.deepEqual(selected?.models, {
    worker: BUILTIN_LATEST_TIER_MODELS.fast,
    implementer: BUILTIN_LATEST_TIER_MODELS.balanced,
    explorer: BUILTIN_LATEST_TIER_MODELS.context,
    reviewer: BUILTIN_LATEST_TIER_MODELS.deep
  });
  assert.deepEqual(selected?.efforts, { worker: 'low', implementer: 'low', explorer: 'medium', reviewer: 'max' });

  const bundle = bundleFor([{ id: 'worker', summary: 'Rename one label.' }]);
  const keys = Object.keys(bundle.request.questions.route_worker && bundle.request.questions.route_worker.type === 'choice'
    ? bundle.request.questions.route_worker.criteria
    : {});
  const pinned = compileDecision(bundle, response({
    route_worker: { type: 'choice', choice: 'gpt-5.6-luna', confidence: 0.95, probabilities: Object.fromEntries(keys.map((key) => [key, 1 / keys.length])) }
  }));
  assert.equal(pinned.kind, 'keep_baseline');
});

test('an uncertain model choice leaves that role on the baseline', () => {
  const bundle = bundleFor([{ id: 'worker', summary: 'Rename one label.' }]);
  const keys = Object.keys(bundle.request.questions.route_worker && bundle.request.questions.route_worker.type === 'choice'
    ? bundle.request.questions.route_worker.criteria
    : {});
  const compiled = compileDecision(bundle, response({
    route_worker: { ...choice('fast', keys), confidence: 0.2 },
    difficulty_worker: { type: 'score', score: 0, confidence: 0.9 },
    risk_worker: { type: 'noul', noul: 0.05 }
  }));
  assert.equal(compiled.kind, 'keep_baseline');
  if (compiled.kind === 'keep_baseline') assert.equal(compiled.reason, 'uncertain');
});

test('a missing role answer does not discard a valid plan choice', () => {
  const bundle = buildDecisionBundle({
    projectId: 'p',
    workflowRunId: 'w',
    workflowRevision: 'r',
    sourceDigest: 'source',
    graphDigest: null,
    goal: 'Fix two independent files.',
    requiredSliceIds: ['S1'],
    planCandidates: [
      {
        id: 'baseline',
        summary: 'Two workers.',
        sliceIds: ['S1'],
        groups: [{ id: 'G1', sliceIds: ['S1'], role: 'worker', effort: 'low' }],
        workerCount: 2,
        requiredVerificationIds: ['review_coverage']
      },
      {
        id: 'grouped',
        summary: 'One worker.',
        sliceIds: ['S1'],
        groups: [{ id: 'G1', sliceIds: ['S1'], role: 'worker', effort: 'low' }],
        workerCount: 1,
        requiredVerificationIds: ['review_coverage']
      }
    ],
    routingCandidates: [{ id: 'worker', summary: 'Edit the file.' }]
  });
  const planKeys = Object.keys(bundle.request.questions.plan && bundle.request.questions.plan.type === 'choice'
    ? bundle.request.questions.plan.criteria
    : {});
  const compiled = compileDecision(bundle, response({ plan: choice('grouped', planKeys) }));
  assert.equal(compiled.kind, 'apply');
  if (compiled.kind !== 'apply') return;
  assert.equal(compiled.effects.some((effect) => effect.kind === 'select_plan'), true);
  assert.equal(compiled.effects.some((effect) => effect.kind === 'select_routing'), false);
});

test('sealed routing skips a user role preference', () => {
  resetLatestModelTierCache();
  const agents = applySealedRouting({
    worker: { routing_dynamic: true, routed_model: BUILTIN_LATEST_TIER_MODELS.deep, routed_model_policy: 'luna_max_mechanical' },
    ui_implementer: {
      routing_dynamic: false,
      routed_model: BUILTIN_LATEST_TIER_MODELS.deep,
      routed_model_policy: 'user_role_model_preference'
    }
  }, {
    id: 'jev_role_fanout',
    summary: 'selected',
    models: { worker: BUILTIN_LATEST_TIER_MODELS.fast, ui_implementer: BUILTIN_LATEST_TIER_MODELS.balanced },
    efforts: { worker: 'low', ui_implementer: 'low' },
    tiers: { worker: 'fast', ui_implementer: 'balanced' }
  });
  assert.equal(agents.worker.routed_model, BUILTIN_LATEST_TIER_MODELS.fast);
  assert.equal(agents.worker.routed_model_policy, 'jev_sealed_routing');
  assert.equal(agents.ui_implementer.routed_model, BUILTIN_LATEST_TIER_MODELS.deep);
  assert.equal(agents.ui_implementer.routed_model_policy, 'user_role_model_preference');
});

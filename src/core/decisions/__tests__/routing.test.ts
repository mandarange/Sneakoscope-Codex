import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecision } from '../policy.js';
import { buildDecisionBundle } from '../questions.js';
import { applySealedRouting, buildRoutingCandidates, MAX_JEV_ROUTING_ROLES } from '../routing.js';
import { SEALED_ROUTING_MODELS, type DecisionsWireResponse } from '../types.js';

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

test('one Decisions request asks model, difficulty, and risk for each role', () => {
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
    for (const model of SEALED_ROUTING_MODELS) assert.equal(typeof criteria.criteria[model.id], 'string');
  }
});

test('a confident fast choice stays fast, and difficulty or risk escalates to Astra', () => {
  const bundle = bundleFor([
    { id: 'worker', summary: 'Rename one label.' },
    { id: 'explorer', summary: 'Search callers.' },
    { id: 'security_reviewer', summary: 'Review auth changes.' }
  ]);
  const keys = Object.keys(bundle.request.questions.route_worker && bundle.request.questions.route_worker.type === 'choice'
    ? bundle.request.questions.route_worker.criteria
    : {});
  const compiled = compileDecision(bundle, response({
    route_worker: choice('gpt-5.6-luna', keys),
    difficulty_worker: { type: 'score', score: 0, confidence: 0.9 },
    risk_worker: { type: 'noul', noul: 0.05 },
    route_explorer: choice('gpt-5.6-terra', keys),
    difficulty_explorer: { type: 'score', score: 3, confidence: 0.9 },
    risk_explorer: { type: 'noul', noul: 0.05 },
    route_security_reviewer: choice('gpt-5.6-luna', keys),
    difficulty_security_reviewer: { type: 'score', score: 0, confidence: 0.9 },
    risk_security_reviewer: { type: 'noul', noul: 0.91 }
  }));
  assert.equal(compiled.kind, 'apply');
  if (compiled.kind !== 'apply') return;
  const models = Object.fromEntries(compiled.effects.flatMap((effect) => (
    effect.kind === 'select_routing' ? [[effect.roleId, effect.model]] : []
  )));
  assert.equal(models.worker, 'gpt-5.6-luna');
  assert.equal(models.explorer, 'gpt-6-astra');
  assert.equal(models.security_reviewer, 'gpt-6-astra');
});

test('an uncertain model choice leaves that role on the baseline', () => {
  const bundle = bundleFor([{ id: 'worker', summary: 'Rename one label.' }]);
  const keys = Object.keys(bundle.request.questions.route_worker && bundle.request.questions.route_worker.type === 'choice'
    ? bundle.request.questions.route_worker.criteria
    : {});
  const compiled = compileDecision(bundle, response({
    route_worker: { ...choice('gpt-5.6-luna', keys), confidence: 0.2 },
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
  const agents = applySealedRouting({
    worker: { routing_dynamic: true, routed_model: 'gpt-6-astra', routed_model_policy: 'luna_max_mechanical' },
    ui_implementer: {
      routing_dynamic: false,
      routed_model: 'gpt-6-astra',
      routed_model_policy: 'user_role_model_preference'
    }
  }, {
    id: 'jev_role_fanout',
    summary: 'selected',
    models: { worker: 'gpt-5.6-luna', ui_implementer: 'gpt-5.6-sol' },
    efforts: { worker: 'low', ui_implementer: 'low' }
  });
  assert.equal(agents.worker.routed_model, 'gpt-5.6-luna');
  assert.equal(agents.worker.routed_model_policy, 'jev_sealed_routing');
  assert.equal(agents.ui_implementer.routed_model, 'gpt-6-astra');
  assert.equal(agents.ui_implementer.routed_model_policy, 'user_role_model_preference');
});

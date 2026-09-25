import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../subagents/model-tiers.js';
import { routeNarutoGpt56Model } from '../../provider/model-router.js';
import { narutoWorkerBackendBlocker, resolveWorkerModelRouting } from '../native-worker-backend-router.js';
import type { CodexTaskInput } from '../../codex-control/codex-control-plane.js';
import { buildCodexExecutionPolicy, buildCodexSdkConfig } from '../../codex-control/codex-sdk-config-policy.js';
import { normalizeCodexModelEffortCatalogPayload } from '../../codex-lb/codex-lb-env.js';

// No Codex models cache in the isolated HOME: tiers resolve to the built-in latest family.
const models = [...new Set([...Object.values(T), 'gpt-5.6-luna', 'gpt-5.6-terra'])];
const modelEfforts = Object.fromEntries(models.map((model) => [model, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']]));

test('Naruto automatic routing picks the newest model of each task tier', () => {
  const available = { availableModels: models, availableModelEfforts: modelEfforts };
  assert.equal(routeNarutoGpt56Model({ ...available, taskText: 'exact one-line single-file rename' }).model, T.fast);
  assert.equal(routeNarutoGpt56Model({ ...available, taskText: 'implementation code_modification' }).model, T.balanced);
  assert.equal(routeNarutoGpt56Model({ ...available, taskText: 'test_execution browser' }).model, T.context);
  assert.deepEqual(routeNarutoGpt56Model({
    ...available,
    taskText: 'Debug the release security failure',
    explicitModel: T.fast,
    reasoningEffort: 'low'
  }), { model: T.fast, reasoning: 'low', serviceTier: 'fast' });
  // An old pinned family is not a current tier model, so it is refused.
  assert.equal(routeNarutoGpt56Model({
    ...available,
    taskText: 'exact one-line single-file rename',
    explicitModel: 'gpt-5.6-terra',
    reasoningEffort: 'medium'
  }).model, '');
});

test('native worker routing uses the task tier until Jev has selected a model', async () => {
  const catalog = { ok: true, models, model_efforts: modelEfforts, blockers: [] };
  const baseline = await resolveWorkerModelRouting({
    agent: { id: 'naruto_dynamic', role: 'executor' },
    slice: { id: 'W-dynamic', kind: 'task', title: 'exact one-line single-file rename', description: 'exact one-line single-file rename' },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  }, { lbCatalog: catalog, lbHealth: { ok: true, degraded_models: [] }, env: {} });
  assert.deepEqual(baseline.blockers, []);
  assert.equal(baseline.choice.model, T.fast);
  const selected = await resolveWorkerModelRouting({
    agent: {
      id: 'naruto_dynamic',
      role: 'executor',
      routed_model: T.balanced,
      routed_model_reasoning_effort: 'low',
      routed_model_policy: 'jev_sealed_routing'
    },
    slice: { id: 'W-dynamic', kind: 'task', title: 'Debug the release security failure', description: 'security review' },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  }, { lbCatalog: catalog, lbHealth: { ok: true, degraded_models: [] }, env: {} });
  assert.equal(selected.blockers.length, 0);
  assert.equal(selected.choice.model, T.balanced);
  assert.equal(selected.choice.reasoning, 'low');
});

test('Naruto fails closed when the selected sealed model or effort is unavailable', () => {
  assert.equal(routeNarutoGpt56Model({
    taskText: 'exact one-line single-file rename',
    availableModels: [T.deep],
    availableModelEfforts: modelEfforts
  }).model, '');
  assert.equal(routeNarutoGpt56Model({
    taskText: 'refactor strategy',
    availableModels: models,
    availableModelEfforts: { ...modelEfforts, [T.deep]: ['xhigh'] }
  }).model, '');
});

test('native Naruto worker routing passes the exact selected model and effort into SDK config', async () => {
  const catalog = { ok: true, models, model_efforts: modelEfforts, blockers: [] };
  const routing = await resolveWorkerModelRouting({
    agent: { id: 'naruto_1', role: 'integrator', naruto_role: 'integrator' },
    slice: { id: 'W1', kind: 'refactor', title: 'Refactor architecture', parent_prompt: 'release integration' },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  }, { lbCatalog: catalog, lbHealth: { ok: true, degraded_models: [] }, env: {} });
  assert.equal(routing.blockers.length, 0);
  assert.equal(routing.choice.model, T.deep);
  assert.equal(routing.choice.reasoning, 'max');
  const task: CodexTaskInput = {
    route: '$Naruto',
    tier: 'worker',
    missionId: 'M-test',
    cwd: process.cwd(),
    prompt: 'refactor',
    outputSchemaId: 'test.schema.v1',
    outputSchema: { type: 'object' },
    sandboxPolicy: 'read-only',
    requestedScopeContract: { route: '$Naruto', read_only: true },
    mutationLedgerRoot: process.cwd(),
    model: routing.choice.model,
    reasoningEffort: routing.choice.reasoning,
    modelReasoningEffort: routing.choice.reasoning,
    serviceTier: routing.choice.serviceTier
  };
  const config = buildCodexSdkConfig(task);
  assert.equal(config.model, T.deep);
  assert.equal(config.model_reasoning_effort, 'max');
  assert.equal(buildCodexExecutionPolicy(task).sandbox, 'read-only');
  assert.equal(buildCodexExecutionPolicy({
    ...task,
    sandboxPolicy: 'workspace-write',
    requestedScopeContract: { route: '$Naruto', read_only: false, allowed_paths: ['src/core'], write_paths: ['src/core'] }
  }).sandbox, 'workspace-write');
});

test('internal Naruto worker routing blocks models that are not current tier models', async () => {
  for (const model of ['gpt-5.4', 'gpt-5.6-luna', 'z-ai/glm-5.2', 'anthropic/claude-sonnet-4.5']) {
    const routing = await resolveWorkerModelRouting({
      agent: { id: 'naruto_1', role: 'implementer', naruto_role: 'implementer' },
      slice: { id: 'W1', kind: 'implementation', title: 'Implement feature' },
      intake: { route: '$Naruto' },
      fastModePolicy: { fast_mode: true, service_tier: 'fast' }
    }, {
      lbCatalog: { ok: true, models, model_efforts: modelEfforts, blockers: [] },
      lbHealth: { ok: true, degraded_models: [] },
      env: { SKS_WORKER_MODEL: model }
    });
    assert.ok(routing.blockers.includes('naruto_worker_model_not_current'), model);
  }
});

test('Naruto rejects the process backend and conflicting effort/tier overrides', async () => {
  assert.equal(narutoWorkerBackendBlocker('process'), 'naruto_process_backend_forbidden');
  assert.equal(narutoWorkerBackendBlocker('codex-sdk'), null);
  const routing = await resolveWorkerModelRouting({
    agent: { id: 'naruto_1', role: 'implementer', naruto_role: 'implementer' },
    slice: { id: 'W1', kind: 'implementation', title: 'Implement feature' },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  }, {
    lbCatalog: { ok: true, models, model_efforts: modelEfforts, blockers: [] },
    lbHealth: { ok: true, degraded_models: [] },
    env: { SKS_WORKER_REASONING: 'high', SKS_WORKER_SERVICE_TIER: 'standard' }
  });
  assert.ok(routing.blockers.includes('naruto_reasoning_override_conflicts_with_policy'));
  assert.ok(routing.blockers.includes('naruto_service_tier_override_conflicts_with_policy'));
});

test('Naruto rejects invalid explicit effort and service-tier overrides', async () => {
  const routing = await resolveWorkerModelRouting({
    agent: { id: 'naruto_1', role: 'implementer', naruto_role: 'implementer' },
    slice: { id: 'W1', kind: 'implementation', title: 'Implement feature' },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  }, {
    lbCatalog: { ok: true, models, model_efforts: modelEfforts, blockers: [] },
    lbHealth: { ok: true, degraded_models: [] },
    env: { SKS_WORKER_REASONING: 'bogus', SKS_WORKER_SERVICE_TIER: 'bogus' }
  });
  assert.ok(routing.blockers.includes('naruto_reasoning_override_invalid'));
  assert.ok(routing.blockers.includes('naruto_service_tier_override_invalid'));
});

test('Codex App and cache effort catalog shapes normalize to the same model contract', () => {
  assert.deepEqual(normalizeCodexModelEffortCatalogPayload({ data: [{
    id: 'gpt-5.6-sol', supportedReasoningEfforts: [{ reasoningEffort: 'xhigh' }, { reasoningEffort: 'max' }]
  }] }), { 'gpt-5.6-sol': ['xhigh', 'max'] });
  assert.deepEqual(normalizeCodexModelEffortCatalogPayload({ models: [{
    slug: 'gpt-5.6-luna', supported_reasoning_levels: [{ effort: 'xhigh' }, { effort: 'max' }]
  }] }), { 'gpt-5.6-luna': ['xhigh', 'max'] });
  assert.deepEqual(normalizeCodexModelEffortCatalogPayload({ models: [{
    slug: 'gpt-5.6-terra', supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'high' }]
  }] }), { 'gpt-5.6-terra': ['medium', 'high'] });
});

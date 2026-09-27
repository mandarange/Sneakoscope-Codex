import '../../dist/core/__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../dist/core/subagents/model-tiers.js';

// Isolated HOME: no Codex models cache, so tiers resolve to the built-in latest family.
const CURRENT = [...new Set([T.fast, T.balanced, T.context, T.deep])];
const allTierCatalog = () => ({ ok: true, models: CURRENT, model_efforts: Object.fromEntries(CURRENT.map((model) => [model, ['low', 'medium', 'high', 'max']])), blockers: [] });
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runNativeCliWorker } from '../../dist/core/agents/native-cli-worker.js';
import { resolveWorkerModelRouting } from '../../dist/core/agents/native-worker-backend-router.js';
import { openRouterOnlyStatePath, writeOpenRouterOnlyState } from '../../dist/core/subagents/child-model-allowlist.js';
import { setDecisionTestOverrides } from '../../dist/core/decisions/integration.js';
import { resetDecisionTransportState } from '../../dist/core/decisions/openrouter.js';
import { defaultDecisionConfig } from '../../dist/core/decisions/config.js';

const OR_LIST = [
  { model: 'google/gemini-3.8-flash', criteria: 'Fast UI edits and renames.', reasoning_effort: 'low', default: false },
  { model: 'z-ai/glm-5.3', criteria: 'Deep refactors and debugging.', reasoning_effort: 'high', default: true },
  { model: 'deepseek/deepseek-v4.1-flash', criteria: '', reasoning_effort: null, default: false }
];
const OR_LISTED = OR_LIST.map((entry) => entry.model);
const LIST_EFFORTS = ['low', 'medium', 'high', 'xhigh'];

async function withOpenRouterOnly(update, run) {
  await writeOpenRouterOnlyState(update);
  try {
    await run();
  } finally {
    await fs.rm(openRouterOnlyStatePath(), { force: true });
  }
}

function narutoWorker(agent = {}, slice = {}) {
  return {
    agent: { id: 'agent-or', role: 'implementation_specialist', naruto_role: 'implementation_specialist', model: 'gpt-5.6-sol', model_reasoning_effort: 'high', ...agent },
    slice: { id: 'task-or', role: 'implementation', description: 'implement provider routing', ...slice },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  };
}

test('OpenRouter Only workers accept and choose only list models, with no codex-lb catalog requirement', async () => {
  await withOpenRouterOnly({ enabled: true, subagent_models: OR_LIST }, async () => {
    // lbCatalog is deliberately not injected: the mode never reads or requires it.
    const deps = { env: {}, lbHealth: { ok: true }, consultJev: false };
    const cases = [
      [narutoWorker(), 'z-ai/glm-5.3', []],
      [narutoWorker({ routed_model: 'google/gemini-3.8-flash', routed_model_policy: 'openrouter_only_jev' }), 'google/gemini-3.8-flash', []],
      [narutoWorker({ routed_model: 'moonshotai/kimi-k3', routed_model_policy: 'openrouter_only_jev' }), 'z-ai/glm-5.3', []],
      [narutoWorker({ routed_model: T.deep, routed_model_reasoning_effort: 'max', routed_model_policy: 'user_role_model_preference' }), 'z-ai/glm-5.3', []],
      [narutoWorker({ routed_model: T.balanced, routed_model_policy: 'jev_sealed_routing' }), 'z-ai/glm-5.3', []],
      [narutoWorker({ model: 'DeepSeek/DeepSeek-V4.1-Flash' }, { role: 'review', description: 'review protocol compatibility' }), 'deepseek/deepseek-v4.1-flash', []]
    ];
    for (const [input, expected, blockers] of cases) {
      const routing = await resolveWorkerModelRouting(input, deps);
      assert.equal(routing.choice.model, expected, JSON.stringify(input.agent));
      assert.deepEqual(routing.blockers, blockers);
      assert.equal(routing.lb_catalog, null);
      assert.ok(LIST_EFFORTS.includes(routing.choice.reasoning), routing.choice.reasoning);
      assert.match(routing.reason, /openrouter only list/);
    }
    const sealed = await resolveWorkerModelRouting(cases[1][0], deps);
    assert.equal(sealed.choice.reasoning, 'low');

    // An explicit override is honored only when listed; an unlisted one blocks and never runs.
    const listed = await resolveWorkerModelRouting(narutoWorker(), { ...deps, env: { SKS_WORKER_MODEL: 'Google/Gemini-3.8-Flash' } });
    assert.equal(listed.choice.model, 'google/gemini-3.8-flash');
    assert.deepEqual(listed.blockers, []);
    for (const override of ['anthropic/claude-sonnet-4.5', T.deep]) {
      const blocked = await resolveWorkerModelRouting(narutoWorker(), { ...deps, env: { SKS_WORKER_MODEL: override } });
      assert.equal(blocked.choice.model, '');
      assert.ok(blocked.blockers.includes('openrouter_only_subagent_model_not_listed'), override);
    }
  });
  await withOpenRouterOnly({ enabled: true, subagent_models: [] }, async () => {
    const empty = await resolveWorkerModelRouting(narutoWorker(), { env: {}, lbHealth: { ok: true }, consultJev: false });
    assert.equal(empty.choice.model, '');
    assert.ok(empty.blockers.includes('openrouter_only_subagent_list_empty'));
  });
});

test('OpenRouter Only workers let Jev pick a list entry and fall back inside the list', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousFlag = process.env.SKS_JEV_DECISION_TEST_OVERRIDES;
  process.env.OPENROUTER_API_KEY = 'sk-or-test-workerroutingaaaaaaa';
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const answer = (choice, confidence) => async () => new Response(JSON.stringify({
    model: 'typesafe/jev-1.13',
    answers: {
      option_child_model_spawn: {
        type: 'choice', choice, confidence,
        probabilities: Object.fromEntries(['m1', 'm2', 'm3', 'keep_baseline'].map((label) => [label, label === choice ? confidence : (1 - confidence) / 3]))
      }
    },
    usage: { input_tokens: 10, output_tokens: 2 }
  }), { status: 200 });
  try {
    await withOpenRouterOnly({ enabled: true, subagent_models: OR_LIST }, async () => {
      for (const [fetchImpl, expected] of [
        [answer('m1', 0.93), 'google/gemini-3.8-flash'],
        [answer('m3', 0.93), 'deepseek/deepseek-v4.1-flash'],
        [answer('m1', 0.3), 'z-ai/glm-5.3'],
        [answer('m9', 0.95), 'z-ai/glm-5.3'],
        [async () => new Response('{}', { status: 500 }), 'z-ai/glm-5.3']
      ]) {
        resetDecisionTransportState();
        setDecisionTestOverrides({ config: { ...defaultDecisionConfig(), mode: 'jev', consentCloud: true }, fetchImpl });
        const routing = await resolveWorkerModelRouting(narutoWorker(), { env: { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY }, lbHealth: { ok: true } });
        assert.equal(routing.choice.model, expected);
        assert.ok(OR_LISTED.includes(routing.choice.model));
        assert.deepEqual(routing.blockers, []);
      }
    });
  } finally {
    setDecisionTestOverrides(null);
    resetDecisionTransportState();
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousFlag === undefined) delete process.env.SKS_JEV_DECISION_TEST_OVERRIDES;
    else process.env.SKS_JEV_DECISION_TEST_OVERRIDES = previousFlag;
  }
});

test('with OpenRouter Only off, a stored list leaves worker routing byte-identical', async () => {
  const inputs = [
    narutoWorker(),
    narutoWorker({ routed_model: T.deep, routed_model_reasoning_effort: 'max', routed_model_policy: 'user_role_model_preference' }),
    { ...narutoWorker(), agent: { id: 'plain', role: 'executor' }, intake: { route: '$Team' } }
  ];
  const deps = { env: {}, lbHealth: { ok: true }, lbCatalog: allTierCatalog(), consultJev: false };
  const snapshot = async () => Promise.all(inputs.map((input) => resolveWorkerModelRouting(input, deps)));
  const baseline = await snapshot();
  assert.ok(baseline.every((routing) => !/openrouter only/.test(routing.reason)));
  await withOpenRouterOnly({ enabled: false, subagent_models: OR_LIST }, async () => {
    assert.deepEqual(await snapshot(), baseline);
  });
});

test('Naruto worker uses its task tier model independently of the selected OpenRouter parent', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-openrouter-home-'));
  await fs.writeFile(path.join(codexHome, 'config.toml'), [
    'model_provider = "openrouter"',
    'model = "anthropic/claude-sonnet-4.5"',
    ''
  ].join('\n'));
  const routing = await resolveWorkerModelRouting({
    agent: {
      id: 'agent-openrouter',
      role: 'implementation_specialist',
      naruto_role: 'implementation_specialist',
      model: 'gpt-5.6-sol',
      model_reasoning_effort: 'high'
    },
    slice: { id: 'task-openrouter', role: 'implementation', description: 'implement provider routing' },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  }, { lbCatalog: allTierCatalog(), lbHealth: { ok: true }, env: { CODEX_HOME: codexHome } });

  assert.deepEqual(routing.blockers, []);
  // Instructed implementation runs on the balanced tier at low; a stale
  // `high` on the old agent row does not carry over.
  assert.equal(routing.choice.model, T.balanced);
  assert.equal(routing.choice.reasoning, 'low');
});

test('a stored preference for a model outside the current tiers cannot replace the child model', async () => {
  const routing = await resolveWorkerModelRouting({
    agent: {
      id: 'agent-role-override',
      role: 'protocol_reviewer',
      naruto_role: 'protocol_reviewer',
      model: 'gpt-5.6-sol',
      model_reasoning_effort: 'max',
      routed_model: 'google/gemini-2.5-pro',
      routed_model_reasoning_effort: 'high',
      routed_model_policy: 'user_role_model_preference'
    },
    slice: { id: 'task-role-override', role: 'review', description: 'review protocol compatibility' },
    intake: { route: '$Naruto', main_model: 'anthropic/claude-sonnet-4.5' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  }, { lbCatalog: allTierCatalog(), lbHealth: { ok: true }, env: {} });

  assert.deepEqual(routing.blockers, []);
  assert.equal(routing.choice.model, T.deep);
  assert.equal(routing.choice.reasoning, 'max');
});

test('native worker ignores a parent model sealed into an old plan', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-sealed-main-home-'));
  await fs.writeFile(path.join(codexHome, 'config.toml'), [
    'model_provider = "openai"',
    'model = "gpt-5.6-sol"',
    ''
  ].join('\n'));
  const routing = await resolveWorkerModelRouting({
    agent: {
      id: 'agent-sealed-main',
      role: 'implementation_specialist',
      naruto_role: 'implementation_specialist',
      model: 'gpt-5.6-sol',
      model_reasoning_effort: 'high',
      routed_model: 'moonshotai/kimi-k3',
      routed_model_reasoning_effort: 'high',
      routed_model_policy: 'active_main_model'
    },
    slice: { id: 'task-sealed-main', role: 'implementation', description: 'implement provider routing' },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  }, { lbCatalog: allTierCatalog(), lbHealth: { ok: true }, env: { CODEX_HOME: codexHome } });

  assert.deepEqual(routing.blockers, []);
  assert.equal(routing.choice.model, T.balanced);
  assert.equal(routing.choice.reasoning, 'low');
});

test('native worker preserves a saved current-model preference and validates it against the catalog', async () => {
  const input = {
    agent: {
      id: 'ui_implementer', role: 'ui_implementer',
      routed_model: T.deep, routed_model_reasoning_effort: 'max',
      routed_model_policy: 'user_role_model_preference'
    },
    slice: { id: 'ui', role: 'implementation', description: 'Implement the toolbar' },
    intake: { route: '$Naruto' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' }
  };
  const catalog = { ok: true, models: [T.deep], model_efforts: { [T.deep]: ['max'] }, blockers: [] };
  const deps = { env: {}, lbHealth: { ok: true }, lbCatalog: catalog };
  const routing = await resolveWorkerModelRouting(input, deps);
  assert.deepEqual(routing.blockers, []);
  assert.equal(routing.choice.model, T.deep);
  assert.equal(routing.choice.reasoning, 'max');
  const unavailable = await resolveWorkerModelRouting(input, {
    ...deps, lbCatalog: { ...catalog, model_efforts: { [T.deep]: ['high'] } }
  });
  assert.equal(unavailable.choice.model, '');
  assert.ok(unavailable.blockers.includes('naruto_worker_model_unavailable'));
});

test('native worker backend router launches process child and marks generated patch source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-test-'));
  const old = snapshotEnv();
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'M-router-test',
        backend: 'process',
        agent_root: root,
        agent: { id: 'agent-router', session_id: 'session-router', slot_id: 'slot-001', generation_index: 1, persona_id: 'executor' },
        slice: { id: 'task-router', write_paths: ['owned.txt'], description: 'process child route' },
        worker_artifact_dir: 'sessions/slot-001/gen-1/worker',
        result_path: 'sessions/slot-001/gen-1/worker/worker-result.json',
        heartbeat_path: 'sessions/slot-001/gen-1/worker/worker-heartbeat.jsonl',
        patch_envelope_path: 'sessions/slot-001/gen-1/worker/worker-patch-envelope.json',
        fast_mode: true,
        service_tier: 'fast'
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(result.backend_router_report.selected_backend, 'process');
    assert.equal(result.patch_envelopes[0].source, 'process_generated');
    assert.equal(typeof result.backend_router_report.child_process_ids[0], 'number');
  } finally {
    restoreEnv(old);
  }
});

function snapshotEnv() {
  return {
    SKS_DISABLE_ROUTE_RECURSION: process.env.SKS_DISABLE_ROUTE_RECURSION,
    SKS_AGENT_WORKER: process.env.SKS_AGENT_WORKER
  };
}

function restoreEnv(old) {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

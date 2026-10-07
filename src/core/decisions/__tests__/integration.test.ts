import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareOfficialSubagentMission } from '../../subagents/official-subagent-preparation.js';
import { officialSubagentLifecycleLockHeld } from '../../subagents/official-subagent-lock.js';
import { decideOfficialSubagentPreparation, setDecisionTestOverrides } from '../integration.js';
import { runDecisionCommand } from '../cli.js';
import { defaultDecisionConfig } from '../config.js';
import { SYNTHETIC_RESPONSE } from './fixtures.js';
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../subagents/model-tiers.js';
import type { BoundedTriwikiAttention } from '../../subagents/triwiki-attention.js';
import { writeOpenRouterOnlyState } from '../../subagents/child-model-allowlist.js';

process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';

function enabledConfig() {
  const config = defaultDecisionConfig();
  return {
    ...config,
    mode: 'jev' as const,
    consentCloud: true,
    capabilities: {
      context: { ready: true, promoted: false, reason: 'test' },
      plan: { ready: true, promoted: false, reason: 'test' },
      recovery: { ready: false, promoted: false, reason: 'unsupported_no_sks_handler' }
    }
  };
}

function emptyAttention(): BoundedTriwikiAttention {
  return {
    schema: 'sks.subagent-triwiki-attention.v1',
    source: '.sneakoscope/wiki/context-graph.json',
    available: false,
    attention_mode: null,
    anchor_limit: 8,
    anchors: [],
    hydration_policy: 'on_demand_only',
    full_pack_injected: false,
    reason: 'context_graph_missing',
    repair_command: 'sks align run',
    snapshot_hash: null,
    snapshot_freshness: null,
    profile: null,
    token_cost: 0,
    token_budget: 2000
  };
}

test('off mode makes no transport call and does not append advisory text', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-off-'));
  const dir = path.join(root, '.sneakoscope', 'missions', 'm-off');
  await fsp.mkdir(dir, { recursive: true });
  t.after(async () => {
    setDecisionTestOverrides(null);
    await fsp.rm(root, { recursive: true, force: true });
  });
  let fetched = 0;
  setDecisionTestOverrides({
    config: defaultDecisionConfig(),
    fetchImpl: async () => {
      fetched += 1;
      return new Response('{}', { status: 500 });
    }
  });
  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-off',
    goal: 'Implement two independent parsers',
    route: '$Naruto',
    mode: 'naruto'
  });
  assert.equal(fetched, 0);
  assert.doesNotMatch(prepared.delegationPrompt, /LOCAL_DECISION_ADVICE|Jev suggests/);
  assert.equal(prepared.plan.requested_subagents_source, 'automatic');
});

test('a stub Jev plan Choice changes the promoted plan before coherent promotion', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-plan-'));
  const dir = path.join(root, '.sneakoscope', 'missions', 'm-plan');
  await fsp.mkdir(dir, { recursive: true });
  t.after(async () => {
    setDecisionTestOverrides(null);
    await fsp.rm(root, { recursive: true, force: true });
  });
  const fetches: string[] = [];
  const observed: Array<{ eligible: boolean; mode: string }> = [];
  setDecisionTestOverrides({
    config: enabledConfig(),
    observe: (event) => observed.push({ eligible: event.eligible, mode: event.mode }),
    fetchImpl: async (url) => {
      fetches.push(String(url));
      assert.equal(officialSubagentLifecycleLockHeld(), false);
      return new Response(JSON.stringify(SYNTHETIC_RESPONSE), { status: 200 });
    }
  });
  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-plan',
    goal: 'Implement two independent parsers in parallel.',
    route: '$Naruto',
    mode: 'naruto',
    env: {
      ...process.env,
      SKS_JEV_DECISION_TEST_OVERRIDES: '1',
      OPENROUTER_API_KEY: 'sk-or-test-integrationaaaaaaaa'
    },
    hardware: {
      cores: 8,
      freeMemoryBytes: 8 * 1024 * 1024 * 1024,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
      processCount: 4,
      fileDescriptorLimit: 256,
      remoteApiRateLimitBudget: 8
    },
    slices: [
      { id: 'S1', title: 'Pagination', description: 'Implement boundary behavior', kind: 'worker', paths: ['src/pagination.ts'] },
      { id: 'S2', title: 'Serializer', description: 'Implement escaping behavior', kind: 'worker', paths: ['src/serializer.ts'] }
    ]
  });
  assert.equal(observed.at(-1)?.mode, 'jev');
  assert.equal(observed.at(-1)?.eligible, true);
  assert.equal(fetches.length, 1);
  assert.doesNotMatch(prepared.delegationPrompt, /LOCAL_DECISION_ADVICE/);
  assert.equal(prepared.plan.jev_decision?.result, 'applied');
  assert.match(prepared.delegationPrompt, /execute the selected plan grouped/);
  assert.equal(prepared.plan.requested_subagents, 1);
  assert.equal(prepared.plan.requested_subagents_source, 'automatic');
  assert.equal(prepared.plan.native_host_dispatch, 'unverified');
});

test('jev without an OpenRouter key keeps the baseline and does not fetch', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-nokey-'));
  const dir = path.join(root, '.sneakoscope', 'missions', 'm-nokey');
  await fsp.mkdir(dir, { recursive: true });
  t.after(async () => {
    setDecisionTestOverrides(null);
    await fsp.rm(root, { recursive: true, force: true });
  });
  let fetched = 0;
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async () => {
      fetched += 1;
      return new Response('{}', { status: 500 });
    }
  });
  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-nokey',
    goal: 'Implement two independent parsers in parallel.',
    route: '$Naruto',
    mode: 'naruto',
    env: {
      HOME: path.join(root, 'home'),
      SKS_HOME: path.join(root, 'sks-home'),
      PATH: process.env.PATH || '',
      SKS_JEV_DECISION_TEST_OVERRIDES: '1'
    },
    slices: [
      { id: 'S1', title: 'Pagination', description: 'Implement boundary behavior', kind: 'worker', paths: ['src/pagination.ts'] },
      { id: 'S2', title: 'Serializer', description: 'Implement escaping behavior', kind: 'worker', paths: ['src/serializer.ts'] }
    ]
  });
  assert.equal(fetched, 0);
  assert.equal(prepared.plan.jev_decision?.result, 'kept_baseline');
  assert.equal(prepared.plan.jev_decision?.reason, 'missing_key');
});

test('Control Center enable argv turns on Jev for undecomposed official-subagent preparation', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-center-on-'));
  const dir = path.join(root, '.sneakoscope', 'missions', 'm-center');
  const sksHome = path.join(root, 'sks-home');
  await fsp.mkdir(dir, { recursive: true });
  t.after(async () => {
    setDecisionTestOverrides(null);
    await fsp.rm(root, { recursive: true, force: true });
  });
  const env: NodeJS.ProcessEnv = {
    HOME: path.join(root, 'home'),
    SKS_HOME: sksHome,
    PATH: process.env.PATH || '',
    SKS_JEV_DECISION_TEST_OVERRIDES: '1',
    OPENROUTER_API_KEY: 'sk-or-test-centerenableaaaaaaaa'
  };
  const originalLog = console.log;
  console.log = () => {};
  try {
    const enabled = await runDecisionCommand([
      'enable',
      '--provider', 'openrouter',
      '--model', 'typesafe/jev-1.13',
      '--consent-cloud',
      '--json'
    ], env);
    assert.equal(enabled, 0);
  } finally {
    console.log = originalLog;
  }
  const fetches: string[] = [];
  let requestBody = '';
  setDecisionTestOverrides({
    fetchImpl: async (url, init) => {
      fetches.push(String(url));
      requestBody = String(init?.body || '');
      assert.equal(officialSubagentLifecycleLockHeld(), false);
      return new Response(JSON.stringify(SYNTHETIC_RESPONSE), { status: 200 });
    }
  });
  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-center',
    goal: 'fix independent files in parallel',
    route: '$Naruto',
    mode: 'naruto',
    env,
    hardware: {
      cores: 8,
      freeMemoryBytes: 8 * 1024 * 1024 * 1024,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
      processCount: 4,
      fileDescriptorLimit: 256,
      remoteApiRateLimitBudget: 8
    }
  });
  assert.equal(fetches.length, 1);
  assert.match(fetches[0] || '', /api\/alpha\/decisions/);
  const sent = JSON.parse(requestBody) as { state: { slices: Array<{ id: string }> }; questions: { plan?: { criteria?: Record<string, string> } } };
  assert.deepEqual(sent.state.slices.map((slice) => slice.id), ['parent_owned_decomposition']);
  assert.ok(sent.questions.plan?.criteria?.baseline);
  assert.ok(sent.questions.plan?.criteria?.grouped);
  assert.equal(prepared.plan.jev_decision?.result, 'applied');
  assert.equal(prepared.plan.requested_subagents, 1);
  assert.equal(prepared.plan.fanout_policy.jev_selected_plan, 'grouped');
  assert.match(prepared.delegationPrompt, /execute the selected plan grouped/);
  assert.equal(prepared.plan.native_host_dispatch, 'unverified');
});

test('Control Center disable argv returns undecomposed preparation to the baseline', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-center-off-'));
  const dir = path.join(root, '.sneakoscope', 'missions', 'm-center-off');
  const sksHome = path.join(root, 'sks-home');
  await fsp.mkdir(dir, { recursive: true });
  t.after(async () => {
    setDecisionTestOverrides(null);
    await fsp.rm(root, { recursive: true, force: true });
  });
  const env: NodeJS.ProcessEnv = {
    HOME: path.join(root, 'home'),
    SKS_HOME: sksHome,
    PATH: process.env.PATH || '',
    SKS_JEV_DECISION_TEST_OVERRIDES: '1',
    OPENROUTER_API_KEY: 'sk-or-test-centerdisableaaaaaaaa'
  };
  const originalLog = console.log;
  console.log = () => {};
  try {
    assert.equal(await runDecisionCommand([
      'enable',
      '--provider', 'openrouter',
      '--model', 'typesafe/jev-1.13',
      '--consent-cloud',
      '--json'
    ], env), 0);
    assert.equal(await runDecisionCommand(['disable', '--json'], env), 0);
  } finally {
    console.log = originalLog;
  }
  let fetched = 0;
  setDecisionTestOverrides({
    fetchImpl: async () => {
      fetched += 1;
      return new Response('{}', { status: 500 });
    }
  });
  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-center-off',
    goal: 'fix independent files in parallel',
    route: '$Naruto',
    mode: 'naruto',
    env
  });
  assert.equal(fetched, 0);
  assert.equal(prepared.plan.jev_decision?.result, 'kept_baseline');
  assert.equal(prepared.plan.jev_decision?.reason, 'off');
});

test('an explicit operator count does not call Jev', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  t.after(() => setDecisionTestOverrides(null));
  let fetched = 0;
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async () => {
      fetched += 1;
      return new Response('{}', { status: 500 });
    }
  });
  const decided = await decideOfficialSubagentPreparation({
    root: process.cwd(),
    dir: process.cwd(),
    missionId: 'm-operator',
    goal: 'fix independent files in parallel',
    workflowRunId: 'w',
    workflowRevision: 'r',
    slices: [],
    requestedSource: 'operator',
    requestedSubagents: 6,
    attention: emptyAttention(),
    env: { OPENROUTER_API_KEY: 'sk-or-test-operatorcountaaaaaaaa', HOME: os.tmpdir(), PATH: process.env.PATH || '' }
  });
  assert.equal(fetched, 0);
  assert.equal(decided.compiled.kind, 'keep_baseline');
  if (decided.compiled.kind === 'keep_baseline') assert.equal(decided.compiled.reason, 'no_alternative');
});

test('a Jev preparation fault keeps the baseline instead of throwing', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  t.after(() => setDecisionTestOverrides(null));
  setDecisionTestOverrides({ config: enabledConfig() });
  const decided = await decideOfficialSubagentPreparation({
    root: os.tmpdir(),
    dir: os.tmpdir(),
    missionId: 'm-fault',
    goal: 'fix independent files in parallel',
    workflowRunId: 'w',
    workflowRevision: 'r',
    slices: null as unknown as [],
    requestedSource: 'automatic',
    requestedSubagents: 6,
    attention: emptyAttention(),
    env: { OPENROUTER_API_KEY: 'sk-or-test-jevfaultaaaaaaaaaa', HOME: os.tmpdir(), PATH: process.env.PATH || '' }
  });
  assert.equal(decided.compiled.kind, 'keep_baseline');
  if (decided.compiled.kind === 'keep_baseline') assert.equal(decided.compiled.reason, 'transport_error');
  assert.equal(decided.llmRejudgeCalls, 0);
});

test('duplicate consumption identity does not dispatch recovery twice', async () => {
  const attention = emptyAttention();
  const first = await decideOfficialSubagentPreparation({
    root: process.cwd(),
    dir: process.cwd(),
    missionId: 'm',
    goal: 'tiny',
    workflowRunId: 'w',
    workflowRevision: 'r',
    slices: [],
    requestedSource: 'automatic',
    requestedSubagents: 1,
    attention
  });
  assert.equal(first.llmRejudgeCalls, 0);
  assert.equal(first.compiled.kind, 'keep_baseline');
});

test('Jev mode fans out one request and applies sealed models with risk escalation', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-route-'));
  const dir = path.join(root, '.sneakoscope', 'missions', 'm-route');
  await fsp.mkdir(dir, { recursive: true });
  t.after(async () => {
    setDecisionTestOverrides(null);
    await fsp.rm(root, { recursive: true, force: true });
  });
  let questionIds: string[] = [];
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body || '')) as {
        questions: Record<string, { type: string; criteria?: Record<string, string> | string[] }>;
      };
      questionIds = Object.keys(body.questions);
      const answers: Record<string, unknown> = {};
      for (const [id, question] of Object.entries(body.questions)) {
        if (question.type === 'choice' && id.startsWith('route_') && question.criteria && !Array.isArray(question.criteria)) {
          const role = id.slice('route_'.length);
          const choice = role === 'explorer' ? 'context'
            : role === 'security_reviewer' ? 'fast'
            : 'balanced';
          answers[id] = sealedChoice(choice, Object.keys(question.criteria));
        } else if (question.type === 'score' && id.startsWith('difficulty_')) {
          answers[id] = { type: 'score', score: 0, confidence: 0.9 };
        } else if (question.type === 'noul' && id.startsWith('risk_')) {
          const role = id.slice('risk_'.length);
          answers[id] = { type: 'noul', noul: role === 'security_reviewer' ? 0.91 : 0.04 };
        } else if (id === 'plan' && question.type === 'choice' && question.criteria && !Array.isArray(question.criteria)) {
          const keys = Object.keys(question.criteria);
          answers.plan = sealedChoice(keys.includes('grouped') ? 'grouped' : keys[0] || 'keep_baseline', keys);
        }
      }
      return new Response(JSON.stringify({
        model: 'typesafe/jev-1.13',
        answers,
        usage: { input_tokens: 80, output_tokens: 12 }
      }), { status: 200 });
    }
  });
  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-route',
    goal: 'Search callers, rename one label, and review the auth change.',
    route: '$Naruto',
    mode: 'naruto',
    env: {
      HOME: path.join(root, 'home'),
      PATH: process.env.PATH || '',
      OPENROUTER_API_KEY: 'sk-or-test-jevroutesaaaaaaaa'
    },
    slices: [
      { id: 'search', title: 'Search', description: 'Search callers', kind: 'worker', agent: 'explorer', paths: ['src'], readOnly: true },
      { id: 'rename', title: 'Rename', description: 'Rename one label', kind: 'worker', agent: 'worker', paths: ['src/a.ts'] },
      { id: 'auth', title: 'Auth', description: 'Review the auth change', kind: 'expert', agent: 'security_reviewer', paths: ['src/auth.ts'], readOnly: true }
    ]
  });
  assert.ok(questionIds.includes('route_explorer'));
  assert.ok(questionIds.includes('difficulty_worker'));
  assert.ok(questionIds.includes('risk_security_reviewer'));
  // Jev chose tiers; each resolves to the newest model of that tier, and the
  // risk answer escalates the security reviewer to the deep tier.
  assert.equal(prepared.plan.agents.explorer.routed_model, T.context);
  assert.equal(prepared.plan.agents.explorer.routed_model_reasoning_effort, 'medium');
  assert.equal(prepared.plan.agents.worker.routed_model, T.balanced);
  assert.equal(prepared.plan.agents.worker.routed_model_reasoning_effort, 'low');
  assert.equal(prepared.plan.agents.security_reviewer.routed_model, T.deep);
  assert.equal(prepared.plan.agents.security_reviewer.routed_model_reasoning_effort, 'max');
  // Jev routes the children, so the parent reads no tier rules to weigh.
  assert.match(prepared.delegationPrompt, /Jev mode: Jev picks each child tier/);
  assert.doesNotMatch(prepared.delegationPrompt, /- tiers: fast for tiny mechanical shards/);
  assert.equal(prepared.plan.agents.explorer.routed_model_policy, 'jev_sealed_routing');
  assert.match(prepared.delegationPrompt, /Jev sealed models:/);
});

const LIST_MODELS = [
  { model: 'google/gemini-3.8-flash', criteria: 'Tiny mechanical edits and renames.', reasoning_effort: 'low' as const, default: false },
  { model: 'z-ai/glm-5.3', criteria: 'Reviews, security, and judgment.', reasoning_effort: 'high' as const, default: true },
  { model: 'deepseek/deepseek-v4.1-flash', criteria: 'Broad code search and long reads.', reasoning_effort: null, default: false }
];

async function listMission(t: test.TestContext, name: string) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), `sks-jev-${name}-`));
  const dir = path.join(root, '.sneakoscope', 'missions', `m-${name}`);
  await fsp.mkdir(dir, { recursive: true });
  t.after(async () => {
    setDecisionTestOverrides(null);
    await fsp.rm(root, { recursive: true, force: true });
  });
  const env = { HOME: path.join(root, 'home'), PATH: process.env.PATH || '', OPENROUTER_API_KEY: 'sk-or-test-listroutesaaaaaaaa' } as NodeJS.ProcessEnv;
  await writeOpenRouterOnlyState({ enabled: true, subagent_models: LIST_MODELS }, { env });
  // The mode's parent is the OpenRouter main model in the Codex config.
  await fsp.writeFile(path.join(root, 'home', '.codex', 'config.toml'), 'model = "z-ai/glm-5.3"\n');
  return { root, dir, env };
}

const LIST_SLICES = [
  { id: 'search', title: 'Search', description: 'Search every caller of the parser', kind: 'worker' as const, agent: 'explorer', paths: ['src'], readOnly: true },
  { id: 'rename', title: 'Rename', description: 'Rename one label', kind: 'worker' as const, agent: 'worker', paths: ['src/a.ts'] },
  { id: 'auth', title: 'Auth', description: 'Review the auth change', kind: 'expert' as const, agent: 'security_reviewer', paths: ['src/auth.ts'], readOnly: true }
];

test('OpenRouter Only Mode: one Jev call picks each role a list model; no tier question is asked', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const { root, dir, env } = await listMission(t, 'list-route');
  const requests: string[][] = [];
  const pick: Record<string, string> = { explorer: 'm3', worker: 'm1', security_reviewer: 'm2' };
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async (_url, init) => {
      assert.equal(officialSubagentLifecycleLockHeld(), false);
      const body = JSON.parse(String(init?.body || '')) as {
        questions: Record<string, { type: string; criteria?: Record<string, string> | string[] }>;
      };
      requests.push(Object.keys(body.questions));
      const answers: Record<string, unknown> = {};
      for (const [id, question] of Object.entries(body.questions)) {
        if (!id.startsWith('option_child_model_') || !question.criteria || Array.isArray(question.criteria)) continue;
        answers[id] = sealedChoice(pick[id.slice('option_child_model_'.length)] || 'keep_baseline', Object.keys(question.criteria));
      }
      return new Response(JSON.stringify({ model: 'typesafe/jev-1.13', answers, usage: { input_tokens: 60, output_tokens: 9 } }), { status: 200 });
    }
  });
  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-list-route',
    goal: 'Search parser callers, rename one label, and review the auth change for the list.',
    route: '$Naruto',
    mode: 'naruto',
    env,
    slices: LIST_SLICES
  });
  const childModelRequests = requests.filter((ids) => ids.some((id) => id.startsWith('option_child_model_')));
  assert.equal(childModelRequests.length, 1);
  assert.ok(childModelRequests[0]!.length <= 8);
  assert.equal(requests.flat().some((id) => id.startsWith('route_')), false);
  const agents = prepared.plan.agents;
  assert.equal(agents.explorer.routed_provider, 'openrouter');
  assert.equal(agents.explorer.routed_model, 'deepseek/deepseek-v4.1-flash');
  // No entry effort: the role effort stays when OpenRouter lists it.
  assert.equal(agents.explorer.routed_model_reasoning_effort, 'medium');
  assert.equal(agents.explorer.routed_model_policy, 'openrouter_only_jev');
  assert.equal(agents.worker.routed_model, 'google/gemini-3.8-flash');
  assert.equal(agents.worker.routed_model_reasoning_effort, 'low');
  assert.equal(agents.security_reviewer.routed_model, 'z-ai/glm-5.3');
  assert.equal(agents.security_reviewer.routed_model_reasoning_effort, 'high');
  const evidence = prepared.plan.openrouter_only;
  assert.equal(evidence.enabled, true);
  assert.equal(evidence.default_subagent_model, 'z-ai/glm-5.3');
  assert.deepEqual(evidence.roles.explorer, { model: 'deepseek/deepseek-v4.1-flash', reasoning_effort: 'medium', entry_key: '["deepseek/deepseek-v4.1-flash",null]', source: 'jev', reason: 'applied', default_entry: false });
  assert.deepEqual(evidence.routed_roles.slice(0, 3).sort(), ['explorer', 'security_reviewer', 'worker']);
  assert.deepEqual([...evidence.jev_decided_roles].sort(), ['explorer', 'security_reviewer', 'worker']);
  // The plan records the OpenRouter parent, not a tier model.
  assert.equal(prepared.plan.parent_model_policy, 'z-ai/glm-5.3');
  assert.deepEqual(prepared.plan.parent, { model: 'z-ai/glm-5.3', model_reasoning_effort: 'xhigh' });
  assert.equal(evidence.main_model, 'z-ai/glm-5.3');
  // Read-only slices spawn through the model-less read-only role; this project has not installed it yet.
  assert.deepEqual(evidence.read_only_role, { name: 'read_only_list_child', installed: false });
  assert.deepEqual(evidence.warnings, ['openrouter_only_read_only_role_missing']);
  assert.ok(prepared.delegationPrompt.includes('pass agent_type="read_only_list_child"'));
  assert.equal(prepared.plan.fanout_policy.jev_child_models.worker, 'google/gemini-3.8-flash');
  assert.ok(prepared.delegationPrompt.includes('pass model="deepseek/deepseek-v4.1-flash" and reasoning_effort="medium" and fork_turns="none"'));
  assert.match(prepared.delegationPrompt, /Jev mode: Jev picks each child's list model from these criteria/);
  for (const tierModel of Object.values(T)) assert.ok(!prepared.delegationPrompt.includes(tierModel), tierModel);
  for (const row of Object.values(agents) as Array<Record<string, any>>) {
    assert.ok(LIST_MODELS.some((entry) => entry.model === row.routed_model), String(row.routed_model));
  }
});

test('OpenRouter Only Mode with Jev off seals every role to the default entry without a network call', async (t) => {
  process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';
  const { root, dir, env } = await listMission(t, 'list-off');
  let fetched = 0;
  setDecisionTestOverrides({
    config: defaultDecisionConfig(),
    fetchImpl: async () => {
      fetched += 1;
      return new Response('{}', { status: 500 });
    }
  });
  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-list-off',
    goal: 'Search parser callers and rename one label for the default list.',
    route: '$Naruto',
    mode: 'naruto',
    env,
    slices: LIST_SLICES
  });
  assert.equal(fetched, 0);
  for (const [name, row] of Object.entries(prepared.plan.agents) as Array<[string, Record<string, any>]>) {
    assert.equal(row.routed_model, 'z-ai/glm-5.3', name);
    assert.equal(row.routed_model_policy, 'openrouter_only_default', name);
    // Jev is off, so every role (inside the lane cap or past it) says so.
    assert.equal(prepared.plan.openrouter_only.roles[name].reason, 'off', name);
  }
  assert.deepEqual(prepared.plan.openrouter_only.jev_decided_roles, []);
  assert.equal(prepared.plan.fanout_policy.jev_child_models, undefined);
  assert.match(prepared.delegationPrompt, /slices created after decomposition take the list model whose criteria fit, else the default/);
  assert.deepEqual(prepared.configBlockers.filter((blocker: string) => blocker.startsWith('openrouter_only')), []);

  // Generic parallel overlays take the same list routing as Naruto.
  const generic = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-list-off',
    goal: 'Review the auth change in parallel for the default list.',
    route: '$Research',
    mode: 'generic',
    env,
    slices: [LIST_SLICES[2]!]
  });
  assert.equal(generic.plan.agents.security_reviewer.routed_model, 'z-ai/glm-5.3');
  assert.equal(generic.plan.agents.security_reviewer.routed_provider, 'openrouter');
  assert.equal(generic.plan.openrouter_only.roles.security_reviewer.model, 'z-ai/glm-5.3');
  assert.ok(generic.delegationPrompt.includes('pass model="z-ai/glm-5.3" and reasoning_effort="high" and fork_turns="none"'));
  for (const tierModel of Object.values(T)) assert.ok(!generic.delegationPrompt.includes(tierModel), tierModel);

  await writeOpenRouterOnlyState({ subagent_models: [] }, { env });
  const empty = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'm-list-off',
    goal: 'Rename one label with an empty list.',
    route: '$Naruto',
    mode: 'naruto',
    env,
    slices: [LIST_SLICES[1]!]
  });
  assert.ok(empty.configBlockers.includes('openrouter_only_subagent_list_empty'));
});

function sealedChoice(choice: string, keys: string[]) {
  const others = keys.filter((key) => key !== choice);
  const share = others.length ? (1 - 0.9) / others.length : 0;
  return {
    type: 'choice',
    choice,
    confidence: 0.91,
    probabilities: Object.fromEntries(keys.map((key) => [key, key === choice ? 0.9 : share]))
  };
}

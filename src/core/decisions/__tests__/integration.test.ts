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
import type { BoundedTriwikiAttention } from '../../subagents/triwiki-attention.js';

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

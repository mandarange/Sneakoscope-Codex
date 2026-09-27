import '../../__tests__/helpers/isolated-test-home.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { loadStoredBridgeProviderRegistry } from '../provider-registry.js';
import { openRouterOnlyStatePath, readOpenRouterOnlyStateSync } from '../../subagents/child-model-allowlist.js';
import {
  OR_MODELS,
  authPriorityEnabled,
  catalogView,
  configModel,
  fixture,
  openRouterOnly,
  run,
  runtime
} from './openrouter-only-controller-fixture.js';

test('ON: seeds the list, turns Codex-LB mode off, drops codex-lb from the catalog, switches the main model, restarts a running Codex', async (t) => {
  const setup = await fixture(t);
  const lb = runtime(setup);
  const priority = await run({ operation: 'auth-priority.set', enabled: true }, lb.options);
  assert.equal(priority.ok, true, JSON.stringify(priority.execution));
  assert.equal(await authPriorityEnabled(setup), true);

  const rt = runtime(setup, { env: { SKS_SKIP_CODEX_APP_RESTART: '' } });
  const on = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
  assert.equal(on.ok, true, JSON.stringify(on.execution));
  const state = readOpenRouterOnlyStateSync({ home: setup.home, env: { HOME: setup.home } });
  assert.equal(state.enabled, true);
  assert.deepEqual(state.subagent_models.map((entry) => [entry.model, entry.criteria, entry.default]), [
    ['vendor-a/model-one', '', true],
    ['vendor-b/model-two', '', false]
  ]);
  assert.deepEqual(state.restore, { previous_model: 'gpt-6-astra', applied_model: 'vendor-a/model-one' });
  assert.equal(await authPriorityEnabled(setup), false);
  assert.deepEqual(on.result.auth_priority, { enabled: false, state: 'off', error: null });

  const view = await catalogView(setup);
  assert.deepEqual(view.models, ['openrouter:vendor-a/model-one', 'openrouter:vendor-b/model-two']);
  assert.deepEqual(view.routeProviders, ['openrouter']);
  assert.equal(rt.fetched.some((url) => url.includes('lb.example.test')), false, 'codex-lb is not contacted');
  const stored = await loadStoredBridgeProviderRegistry({ home: setup.home });
  assert.equal(stored.registry?.profiles['codex-lb'].enabled, true, 'the codex-lb profile is kept for OFF');

  assert.deepEqual(await configModel(setup), ['model = "vendor-a/model-one"']);
  assert.deepEqual(rt.codexRestarts, ['restart']);
  const payload = openRouterOnly(on);
  assert.equal(payload.state, 'active', JSON.stringify(payload));
  assert.equal(payload.error, null);
  assert.equal(payload.main_model, 'vendor-a/model-one');
  assert.equal(payload.default_subagent_model, 'vendor-a/model-one');
  assert.deepEqual(payload.subagent_models.map((entry: any) => [entry.model, entry.routable]), [['vendor-a/model-one', true], ['vendor-b/model-two', true]]);
  assert.deepEqual(Object.keys(payload).sort(), ['default_subagent_model', 'enabled', 'error', 'jev_enabled', 'main_model', 'state', 'subagent_models', 'warnings']);
  assert.ok(payload.warnings.includes('openrouter_only_codex_image_mode_unavailable'));
  assert.equal(on.status?.catalog_sync.providers['codex-lb'].state, 'not_started');
  assert.doesNotMatch(JSON.stringify(on), /openrouter-only-secret/);
});

test('ON preconditions block before anything is written', async (t) => {
  const disabled = await fixture(t);
  const disabledRuntime = runtime(disabled);
  const off = await run({ operation: 'provider.disable', provider_id: 'openrouter' }, disabledRuntime.options);
  assert.equal(off.ok, true, JSON.stringify(off.execution));
  const unverified = await fixture(t, { openrouterValidated: false });
  const empty = await fixture(t, { selection: [], model: 'gpt-6-astra' });
  for (const [setup, blocker] of [
    [disabled, 'openrouter_only_provider_disabled'],
    [unverified, 'openrouter_only_credential_missing'],
    [empty, 'openrouter_only_no_openrouter_models']
  ] as const) {
    const rt = runtime(setup);
    const configBefore = await fs.readFile(setup.configPath, 'utf8');
    const result = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
    assert.equal(result.ok, false, blocker);
    assert.deepEqual(result.execution.blockers, [blocker]);
    await assert.rejects(fs.access(openRouterOnlyStatePath({ home: setup.home, env: { HOME: setup.home } })), blocker);
    assert.equal(await fs.readFile(setup.configPath, 'utf8'), configBefore, blocker);
    assert.deepEqual(rt.fetched, [], blocker);
    assert.equal(openRouterOnly(result).enabled, false, blocker);
  }
});

test('OFF restores codex-lb rows and the replaced main model; auth priority stays off', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup, { env: { SKS_SKIP_CODEX_APP_RESTART: '' } });
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
  const off = await run({ operation: 'openrouter-only.set', enabled: false, no_restart: true }, rt.options);
  assert.equal(off.ok, true, JSON.stringify(off.execution));
  const state = readOpenRouterOnlyStateSync({ home: setup.home, env: { HOME: setup.home } });
  assert.equal(state.enabled, false);
  assert.equal(state.subagent_models.length, 2, 'the list is kept across toggles');
  assert.equal(state.restore, null);
  assert.deepEqual(await configModel(setup), ['model = "gpt-6-astra"']);
  const view = await catalogView(setup);
  assert.ok(view.models.includes('codex-lb:gpt-6-astra'));
  assert.deepEqual(view.routeProviders, ['codex-lb', 'openrouter']);
  assert.equal(await authPriorityEnabled(setup), false);
  assert.deepEqual(openRouterOnly(off).state, 'off');
  assert.deepEqual((off.result.codex_restart as Record<string, unknown>).reason, 'no_restart_flag');
  assert.deepEqual(rt.codexRestarts, ['restart'], 'only ON restarted Codex');

  const again = await run({ operation: 'openrouter-only.set', enabled: false }, rt.options);
  assert.equal(again.ok, true);
  assert.equal(again.result.changed, false);
  assert.equal((again.result.codex_restart as Record<string, unknown>).reason, 'config_unchanged');
});

test('OFF never overwrites a main model the user picked while the mode was on', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
  const text = await fs.readFile(setup.configPath, 'utf8');
  await fs.writeFile(setup.configPath, text.replace('model = "vendor-a/model-one"', 'model = "vendor-b/model-two"'));
  const off = await run({ operation: 'openrouter-only.set', enabled: false }, rt.options);
  assert.equal(off.ok, true);
  assert.equal((off.result.main_model as Record<string, unknown>).action, 'user_changed');
  assert.deepEqual(await configModel(setup), ['model = "vendor-b/model-two"']);
  assert.equal(readOpenRouterOnlyStateSync({ home: setup.home, env: { HOME: setup.home } }).restore, null);
  assert.deepEqual(rt.codexRestarts, [], 'SKS_SKIP_CODEX_APP_RESTART=1 skips every restart');
});

test('ON restores an unset main model by removing the line again', async (t) => {
  const setup = await fixture(t, { model: null });
  const rt = runtime(setup);
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
  assert.deepEqual(await configModel(setup), ['model = "vendor-a/model-one"']);
  assert.deepEqual(readOpenRouterOnlyStateSync({ home: setup.home, env: { HOME: setup.home } }).restore, { previous_model: null, applied_model: 'vendor-a/model-one' });
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: false }, rt.options)).ok, true);
  assert.deepEqual(await configModel(setup), []);
});

test('auth-priority on turns OpenRouter Only Mode off in the same operation', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
  const bootstrapsBefore = rt.bootstraps.length;
  const priority = await run({ operation: 'auth-priority.set', enabled: true }, rt.options);
  assert.equal(priority.ok, true, JSON.stringify(priority.execution));
  assert.equal(openRouterOnly(priority).enabled, false);
  assert.equal((priority.result.auth_priority as Record<string, unknown>).enabled, true);
  assert.equal(readOpenRouterOnlyStateSync({ home: setup.home, env: { HOME: setup.home } }).enabled, false);
  assert.equal(await authPriorityEnabled(setup), true);
  assert.deepEqual(await configModel(setup), ['model = "gpt-6-astra"']);
  assert.ok((await catalogView(setup)).routeProviders.includes('codex-lb'));
  assert.equal(rt.bootstraps.length - bootstrapsBefore, 1, 'one bridge restart covers both changes');
});

test('subagent-models set validates every row and writes nothing on any issue', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  const cases: Array<[unknown[], string[]]> = [
    [[{ model: 'no-slash' }], ['subagent_model_id_invalid:0']],
    [[{ model: 'vendor-a/model-one' }, { model: 'VENDOR-A/model-one' }], ['subagent_model_duplicate:1']],
    [[{ model: 'vendor-a/model-one', reasoning_effort: 'max' }], ['subagent_model_effort_invalid:0']],
    [Array.from({ length: 17 }, (_, index) => ({ model: `vendor/model-${index}` })), ['subagent_model_list_too_long:16']]
  ];
  for (const [rows, blockers] of cases) {
    const result = await run({ operation: 'subagent-models.set', subagent_models: rows }, rt.options);
    assert.equal(result.ok, false);
    assert.deepEqual(result.execution.blockers, blockers);
    await assert.rejects(fs.access(openRouterOnlyStatePath({ home: setup.home, env: { HOME: setup.home } })));
  }
  const payload = await run({ operation: 'subagent-models.set', subagent_models: 'nope' as unknown as unknown[] }, rt.options);
  assert.deepEqual(payload.execution.blockers, ['subagent_models_payload_invalid']);
});

test('the list is exposed to Codex only while the mode is on; mode OFF sync keeps the plain picker selection', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  const set = await run({ operation: 'subagent-models.set', subagent_models: [
    { model: 'vendor-d/list-only', criteria: 'long refactors', reasoning_effort: 'high', default: true }
  ] }, rt.options);
  assert.equal(set.ok, true);
  assert.equal(set.result.catalog_sync, null, 'no sync while the mode is off');
  assert.equal((await run({ operation: 'catalog.sync' }, rt.options)).ok, true);
  let view = await catalogView(setup);
  assert.deepEqual(view.models.filter((id) => id.startsWith('openrouter:')), ['openrouter:vendor-a/model-one', 'openrouter:vendor-b/model-two']);
  assert.ok(view.models.includes('codex-lb:lb-mutation-model'));

  const on = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
  assert.equal(on.ok, true, JSON.stringify(on.execution));
  view = await catalogView(setup);
  assert.deepEqual(view.models, ['openrouter:vendor-a/model-one', 'openrouter:vendor-b/model-two', 'openrouter:vendor-d/list-only']);
  assert.deepEqual(await configModel(setup), ['model = "vendor-d/list-only"']);

  const edit = await run({ operation: 'subagent-models.set', subagent_models: [
    { model: 'vendor-c/model-three', criteria: 'tests', reasoning_effort: null, default: true }
  ] }, rt.options);
  assert.equal(edit.ok, true, JSON.stringify(edit.execution));
  view = await catalogView(setup);
  assert.deepEqual(view.models, [
    'openrouter:vendor-a/model-one', 'openrouter:vendor-b/model-two', 'openrouter:vendor-c/model-three', 'openrouter:vendor-d/list-only'
  ], 'the configured main model stays exposed after it leaves the list');
  assert.deepEqual(openRouterOnly(edit).subagent_models.map((entry: any) => [entry.model, entry.routable, entry.default]), [['vendor-c/model-three', true, true]]);

  const list = await run({ operation: 'subagent-models.list' }, rt.options);
  assert.equal(list.ok, true);
  assert.deepEqual((list.result.available as Array<{ public_id: string }>).map((row) => row.public_id).sort(), OR_MODELS);
});

test('status reports the first unavailable reason in contract order', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
  const stopped = await run({ operation: 'openrouter-only.status' }, runtime(setup, { running: false }).options);
  assert.deepEqual([openRouterOnly(stopped).state, openRouterOnly(stopped).error], ['unavailable', 'desktop_bridge_not_running']);
  const text = await fs.readFile(setup.configPath, 'utf8');
  await fs.writeFile(setup.configPath, text.replace('model = "vendor-a/model-one"', 'model = "gpt-6-astra"'));
  const gpt = await run({ operation: 'openrouter-only.status' }, rt.options);
  assert.equal(openRouterOnly(gpt).error, 'openrouter_only_main_model_not_openrouter');
  assert.equal((await run({ operation: 'subagent-models.set', subagent_models: [] }, rt.options)).ok, true);
  const empty = await run({ operation: 'openrouter-only.status' }, rt.options);
  assert.equal(openRouterOnly(empty).error, 'openrouter_only_subagent_list_empty');
});

test('a failed mode switch still echoes both modes; a store commit that fails rolls the activation back', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run({ operation: 'auth-priority.set', enabled: true }, rt.options)).ok, true);
  const catalogBefore = await catalogView(setup);
  await fs.mkdir(openRouterOnlyStatePath({ home: setup.home, env: { HOME: setup.home } }), { recursive: true });
  const bootstrapsBefore = rt.bootstraps.length;
  const result = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
  assert.equal(result.ok, false);
  assert.deepEqual(result.execution.blockers, ['combined_catalog_commit_failed']);
  assert.equal(openRouterOnly(result).enabled, false);
  assert.equal((result.result.auth_priority as Record<string, unknown>).enabled, true, 'Codex-LB mode stays on');
  assert.equal(await authPriorityEnabled(setup), true);
  assert.deepEqual(await catalogView(setup), catalogBefore, 'the OpenRouter-only catalog is rolled back');
  assert.equal(rt.bootstraps.length, bootstrapsBefore, 'the bridge is not restarted');
  assert.deepEqual(await configModel(setup), ['model = "gpt-6-astra"']);
});

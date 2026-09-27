import '../../__tests__/helpers/isolated-test-home.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { readBridgeModelSelection } from '../combined-catalog/model-selection.js';
import { desktopBridgeServicePaths } from '../desktop-service.js';
import { openRouterOnlyStatePath, writeOpenRouterOnlyState } from '../../subagents/child-model-allowlist.js';
import {
  authPriorityEnabled,
  catalogView,
  configModel,
  fixture,
  openRouterOnly,
  policyDefault,
  run,
  runtime,
  serviceStatus,
  store
} from './openrouter-only-controller-fixture.js';

/**
 * OpenRouter Only Mode transitions that must land whole or not at all: failed
 * syncs, list edits while on, OFF keeping the main model routable, the default
 * provider round trip, and unmanage/rollback turning the mode off.
 */

test('a failed ON sync writes nothing: no store, no seeded list, Codex-LB mode and codex-lb rows stay', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run({ operation: 'auth-priority.set', enabled: true }, rt.options)).ok, true);
  const catalogBefore = await catalogView(setup);
  rt.control.failOpenRouter = true;
  const on = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
  assert.equal(on.ok, false);
  await assert.rejects(fs.access(openRouterOnlyStatePath({ home: setup.home, env: { HOME: setup.home } })));
  assert.equal(await authPriorityEnabled(setup), true);
  assert.deepEqual(await catalogView(setup), catalogBefore);
  assert.deepEqual(await configModel(setup), ['model = "gpt-6-astra"']);
});

test('ON refuses a list with no routable model; while ON a failed sync keeps the old list and only a newly exposed model restarts Codex', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup, { env: { SKS_SKIP_CODEX_APP_RESTART: '' } });
  assert.equal((await run({ operation: 'subagent-models.set', subagent_models: [{ model: 'vendor-z/not-served' }] }, rt.options)).ok, true);
  const refused = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.execution.blockers, ['openrouter_only_no_routable_subagent_model']);
  assert.equal(store(setup).enabled, false, 'nothing is committed');
  assert.deepEqual(await configModel(setup), ['model = "gpt-6-astra"']);
  assert.equal(rt.codexRestarts.length, 0);

  assert.equal((await run({ operation: 'subagent-models.set', subagent_models: [
    { model: 'vendor-z/not-served', default: true }, { model: 'vendor-c/model-three' }
  ] }, rt.options)).ok, true);
  const on = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
  assert.equal(on.ok, true, JSON.stringify(on.execution));
  assert.deepEqual(on.execution.blockers, []);
  assert.deepEqual(await configModel(setup), ['model = "vendor-c/model-three"'], 'the first routable entry when the default is not served');
  const catalogOn = await catalogView(setup);
  const bootstrapsOn = rt.bootstraps.length;
  const restartsOn = rt.codexRestarts.length;

  rt.control.failOpenRouter = true;
  const failed = await run({ operation: 'subagent-models.set', subagent_models: [{ model: 'vendor-c/model-three', default: true }] }, rt.options);
  assert.equal(failed.ok, false);
  assert.deepEqual(store(setup).subagent_models.map((entry) => entry.model), ['vendor-z/not-served', 'vendor-c/model-three'], 'the old list stays');
  assert.deepEqual(await catalogView(setup), catalogOn);
  assert.equal(rt.bootstraps.length, bootstrapsOn, 'the bridge keeps the list it enforces');

  rt.control.failOpenRouter = false;
  const edit = await run({ operation: 'subagent-models.set', subagent_models: [{ model: 'vendor-c/model-three', default: true }] }, rt.options);
  assert.equal(edit.ok, true, JSON.stringify(edit.execution));
  assert.equal(edit.execution.status, 'completed');
  assert.deepEqual(store(setup).restore, { previous_model: 'gpt-6-astra', applied_model: 'vendor-c/model-three' });
  assert.equal(openRouterOnly(edit).state, 'active');
  assert.equal(rt.codexRestarts.length - restartsOn, 0, 'no model was newly exposed');
  assert.deepEqual(edit.result.warnings, []);

  const criteria = await run({ operation: 'subagent-models.set', subagent_models: [{ model: 'vendor-c/model-three', criteria: 'tests', default: true }] }, rt.options);
  assert.equal(criteria.result.changed, false, 'same catalog, same main model');
  assert.equal((criteria.result.codex_restart as Record<string, unknown>).reason, 'config_unchanged');

  const added = await run({ operation: 'subagent-models.set', no_restart: true, subagent_models: [
    { model: 'vendor-c/model-three', default: true }, { model: 'vendor-d/list-only' }
  ] }, rt.options);
  assert.equal(added.ok, true);
  assert.equal(added.result.changed, true);
  assert.deepEqual(added.result.warnings, ['codex_relaunch_required_for_new_subagent_models']);
  assert.equal(rt.codexRestarts.length - restartsOn, 0, '--no-restart leaves Codex alone');
});

test('OFF keeps an OpenRouter main model the user picked while ON routable, and the default provider survives the round trip', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal(await policyDefault(setup), 'codex-lb');
  assert.equal((await run({ operation: 'subagent-models.set', subagent_models: [
    { model: 'vendor-d/list-only', default: true }, { model: 'vendor-c/model-three' }
  ] }, rt.options)).ok, true);
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
  assert.equal(await policyDefault(setup), 'codex-lb', 'carried through while codex-lb has no routes');
  const text = await fs.readFile(setup.configPath, 'utf8');
  await fs.writeFile(setup.configPath, text.replace('model = "vendor-d/list-only"', 'model = "vendor-c/model-three"'));
  const off = await run({ operation: 'openrouter-only.set', enabled: false }, rt.options);
  assert.equal(off.ok, true, JSON.stringify(off.execution));
  assert.equal((off.result.main_model as Record<string, unknown>).action, 'user_changed');
  assert.deepEqual(await configModel(setup), ['model = "vendor-c/model-three"']);
  const view = await catalogView(setup);
  assert.ok(view.models.includes('openrouter:vendor-c/model-three'), JSON.stringify(view.models));
  assert.ok(view.models.includes('codex-lb:gpt-6-astra'));
  assert.ok((await readBridgeModelSelection(setup.home)).openrouter.public_ids.includes('vendor-c/model-three'));
  assert.equal(await policyDefault(setup), 'codex-lb');
});

test('OFF with a refused restore keeps the SKS-applied list model routable', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run({ operation: 'subagent-models.set', subagent_models: [{ model: 'vendor-d/list-only' }] }, rt.options)).ok, true);
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
  assert.deepEqual(await configModel(setup), ['model = "vendor-d/list-only"']);
  const off = await run({ operation: 'openrouter-only.set', enabled: false }, {
    ...rt.options,
    safeWriteConfigImpl: async (configPath) => ({ ok: false, status: 'concurrent_change_detected', config_path: configPath, backup_path: null, changed: false })
  });
  assert.equal(off.ok, true, JSON.stringify(off.execution));
  assert.deepEqual(off.execution.blockers, ['openrouter_only_main_model_write_concurrent_change_detected']);
  assert.equal(store(setup).enabled, false);
  assert.deepEqual(store(setup).restore, { previous_model: 'gpt-6-astra', applied_model: 'vendor-d/list-only' }, 'kept for the next attempt');
  const view = await catalogView(setup);
  assert.ok(view.models.includes('openrouter:vendor-d/list-only'), JSON.stringify(view.models));
  assert.ok(view.models.includes('codex-lb:gpt-6-astra'));
});

test('explicit OFF re-syncs a catalog an interrupted ON left without codex-lb rows', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
  await writeOpenRouterOnlyState({ enabled: false, restore: null }, { home: setup.home, env: { HOME: setup.home } });
  assert.deepEqual((await catalogView(setup)).routeProviders, ['openrouter']);
  const off = await run({ operation: 'openrouter-only.set', enabled: false, no_restart: true }, rt.options);
  assert.equal(off.ok, true, JSON.stringify(off.execution));
  assert.equal(off.result.changed, true);
  assert.deepEqual((await catalogView(setup)).routeProviders, ['codex-lb', 'openrouter']);
});

test('unmanage and rollback while ON turn the mode off and put the main model back', async (t) => {
  for (const operation of ['unmanage', 'rollback'] as const) {
    const setup = await fixture(t);
    const rt = runtime(setup);
    assert.equal((await run({ operation: 'openrouter-only.set', enabled: true }, rt.options)).ok, true);
    const paths = desktopBridgeServicePaths(setup.home);
    let service = serviceStatus(setup.home, true);
    const result = await run(operation === 'unmanage'
      ? { operation, confirmed: true }
      : { operation, receipt_id: 'receipt-before-on', confirmed: true }, {
      ...rt.options,
      serviceStatusImpl: async () => service,
      stopServiceImpl: async (input) => {
        if (input?.removeSettings) await fs.rm(paths.settings_path, { force: true });
        if (input?.removePlist) await fs.rm(paths.launch_agent_path, { force: true });
        service = { ...serviceStatus(setup.home, false), installed: Boolean(!input?.removePlist) };
        return service;
      },
      rollbackReceiptImpl: async () => {
        await fs.writeFile(setup.configPath, 'model = "vendor-a/model-one"\n');
        return {
          schema: 'sks.desktop-bridge-unification-rollback.v1', ok: true, status: 'rolled_back', receipt_id: 'receipt-before-on',
          restored_files: [setup.configPath], credentials_overwritten: false, auth_overwritten: false, conflicts: []
        };
      }
    });
    assert.equal(result.ok, true, `${operation}: ${JSON.stringify(result.execution)}`);
    assert.equal(result.status?.management.managed, false, operation);
    assert.equal(store(setup).enabled, false, operation);
    assert.equal(store(setup).restore, null, operation);
    assert.deepEqual(await configModel(setup), ['model = "gpt-6-astra"'], operation);
    assert.equal(((result.result.openrouter_only_off as Record<string, any>).main_model).action, 'restored', operation);
  }
});

test('a Codex restart that fails is a blocker, not a completed switch', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup, { env: { SKS_SKIP_CODEX_APP_RESTART: '' }, restartOk: false });
  const on = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
  assert.equal(on.ok, true);
  assert.equal(on.execution.status, 'partial');
  assert.deepEqual(on.execution.blockers, ['codex_restart_failed_manual_restart_required']);
  const priority = await run({ operation: 'auth-priority.set', enabled: true }, rt.options);
  assert.deepEqual(priority.execution.blockers, ['codex_restart_failed_manual_restart_required']);
});

test('a committed ON reports post-commit failures as blockers, restarts Codex, and never overwrites a model line it cannot read', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup, { env: { SKS_SKIP_CODEX_APP_RESTART: '' } });
  const text = await fs.readFile(setup.configPath, 'utf8');
  await fs.writeFile(setup.configPath, text.replace('model = "gpt-6-astra"', "model = 'gpt-6-astra'"));
  // ~/.codex/agents exists but is a file, so the read-only role cannot be installed.
  await fs.writeFile(`${setup.codexHome}/agents`, 'not a directory', 'utf8');
  const on = await run({ operation: 'openrouter-only.set', enabled: true }, rt.options);
  assert.equal(on.ok, true, JSON.stringify(on.execution));
  assert.equal(on.execution.status, 'partial');
  assert.deepEqual(on.execution.blockers, ['openrouter_only_main_model_unparsed', 'openrouter_only_read_only_role_install_failed']);
  assert.equal(store(setup).enabled, true);
  assert.deepEqual(await configModel(setup), ["model = 'gpt-6-astra'"], 'an unreadable model line is left alone');
  assert.equal(rt.codexRestarts.length, 1, 'Codex still restarts to load the committed catalog');
});

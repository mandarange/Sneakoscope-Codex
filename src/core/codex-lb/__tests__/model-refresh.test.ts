import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { catalogView, fixture, run, runtime } from './openrouter-only-controller-fixture.js';
import { desktopBridgeModelsEtag } from '../desktop-bridge/models-endpoint.js';

// The model list refreshes on every update, Doctor, setup and SKS Center
// change, not only once the catalog is twelve hours old, and Codex is pointed
// at a list it can follow.

const refresh = (overrides: Record<string, unknown> = {}) => ({ operation: 'models.refresh' as const, reason: 'test', force: true, allow_config_writes: true, ...overrides });
const modelRefresh = (result: Awaited<ReturnType<typeof run>>) => result.result.model_refresh as Record<string, any>;
const LINE = /^Model list refreshed: \d+ models \(\+\d+ −\d+\) generation [0-9a-f]{8}/;

test('a refresh fetches every provider although the catalog is fresh, and reports one line', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  const result = await run(refresh(), rt.options);
  assert.equal(result.ok, true, JSON.stringify(result.execution));
  const summary = modelRefresh(result);
  assert.match(summary.line, LINE);
  assert.equal(summary.skipped, false);
  assert.ok(rt.fetched.some((url) => url.includes('openrouter.ai')) && rt.fetched.some((url) => url.includes('lb.example.test')), rt.fetched.join(','));
  // No ChatGPT sign-in: Codex only reads a file, so SKS keeps binding it.
  assert.equal(summary.codex_model_source, 'model_catalog_json');
  assert.match(await fs.readFile(setup.configPath, 'utf8'), /^model_catalog_json = /m);
});

test('a read-only refresh never writes config.toml, and an unchanged catalog keeps its path', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run(refresh(), rt.options)).ok, true);
  const config = await fs.readFile(setup.configPath, 'utf8');
  // Later, with nothing changed upstream: new check times, the same bundle path.
  const later = runtime(setup);
  later.options.now = () => new Date('2026-09-27T09:00:00.000Z');
  const readOnly = await run(refresh({ allow_config_writes: false }), later.options);
  assert.equal(readOnly.ok, true, JSON.stringify(readOnly.execution));
  assert.match(modelRefresh(readOnly).line, LINE);
  assert.equal(await fs.readFile(setup.configPath, 'utf8'), config, 'config.toml untouched');
  const status = (readOnly.status as any)?.catalog_sync?.providers?.openrouter;
  assert.equal(status?.expires_at > '2026-09-27T09', true, 'the reused bundle carries the newer expiry');

  // A change that would need config.toml is deferred, not half-applied.
  await fs.writeFile(setup.configPath, 'model = "gpt-6-astra"\n');
  const deferred = await run(refresh({ allow_config_writes: false }), later.options);
  assert.equal(deferred.ok, false);
  assert.ok(modelRefresh(deferred).blockers.includes('desktop_bridge_config_write_deferred'));
  assert.equal(await fs.readFile(setup.configPath, 'utf8'), 'model = "gpt-6-astra"\n');
});

test('a refresh under a minute after the last one, for the same providers, is not repeated', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run(refresh({ force: false }), rt.options)).ok, true);
  const fetches = rt.fetched.length;
  const again = await run(refresh({ force: false }), rt.options);
  assert.equal(again.ok, true);
  assert.equal(modelRefresh(again).skipped, true);
  assert.deepEqual(modelRefresh(again).warnings, ['model_refresh_skipped_recent']);
  assert.equal(rt.fetched.length, fetches, 'no second fetch');
  assert.equal(modelRefresh(await run(refresh(), rt.options)).skipped, false, 'an explicit refresh always fetches');
});

test('a provider that cannot be reached keeps its last good models', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run(refresh(), rt.options)).ok, true);
  const before = await catalogView(setup);
  assert.ok(before.models.some((row) => row.startsWith('openrouter:')));
  rt.control.failOpenRouter = true;
  const failed = await run(refresh(), rt.options);
  assert.equal(failed.ok, false);
  assert.ok(modelRefresh(failed).blockers.includes('openrouter_catalog_refresh_failed'), JSON.stringify(modelRefresh(failed).blockers));
  assert.match(modelRefresh(failed).line, /previous list stays active.*sks bridge models refresh/);
  assert.deepEqual(await catalogView(setup), before);
});

test('with a ChatGPT sign-in Codex follows the bridge /models, without a restart after the first switch', async (t) => {
  const setup = await fixture(t);
  await fs.writeFile(path.join(setup.codexHome, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: 'acct_fixture', access_token: 'a'.repeat(24), refresh_token: 'r'.repeat(24), id_token: 'i'.repeat(24) } }), { mode: 0o600 });
  const rt = runtime(setup);
  const checked: string[] = [];
  rt.options.modelsSelfCheckImpl = async (baseUrl, catalog) => { checked.push(desktopBridgeModelsEtag(catalog.generation)); return baseUrl.startsWith('http://127.0.0.1') ? null : 'unexpected_base_url'; };
  const first = await run(refresh(), rt.options);
  assert.equal(first.ok, true, JSON.stringify(first.execution));
  assert.equal(modelRefresh(first).codex_model_source, 'bridge_models');
  assert.equal(modelRefresh(first).restart_codex_required, true, 'Codex drops a static list only at its next launch');
  const config = await fs.readFile(setup.configPath, 'utf8');
  assert.doesNotMatch(config, /model_catalog_json|sks-desktop-bridge-managed-model-catalog/);
  assert.match(config, /^# sks-desktop-bridge-managed-base-url$/m);

  const second = await run(refresh(), rt.options);
  assert.equal(modelRefresh(second).codex_model_source, 'bridge_models');
  assert.equal(modelRefresh(second).restart_codex_required, false);
  assert.equal(await fs.readFile(setup.configPath, 'utf8'), config, 'a sync keeps Codex on the bridge list');
  assert.equal(checked.length, 2);

  // A bridge that does not serve the catalog: Codex gets the file back.
  rt.options.modelsSelfCheckImpl = async () => 'bridge_models_self_check_unreachable';
  const fallback = await run(refresh(), rt.options);
  assert.equal(modelRefresh(fallback).codex_model_source, 'model_catalog_json');
  assert.ok(modelRefresh(fallback).warnings.includes('bridge_models_self_check_unreachable'));
  assert.match(await fs.readFile(setup.configPath, 'utf8'), /^model_catalog_json = /m);
});

test('a model_catalog_json the user wrote is left alone and reported', async (t) => {
  const setup = await fixture(t);
  const rt = runtime(setup);
  assert.equal((await run(refresh(), rt.options)).ok, true);
  const managed = await fs.readFile(setup.configPath, 'utf8');
  const pinned = managed
    .replace(/^# sks-desktop-bridge-managed-model-catalog\n/m, '')
    .replace(/^model_catalog_json = .*$/m, 'model_catalog_json = "/Users/someone/my-models.json"');
  await fs.writeFile(setup.configPath, pinned);
  const result = await run(refresh(), rt.options);
  assert.equal(result.ok, true, JSON.stringify(result.execution));
  assert.equal(modelRefresh(result).codex_model_source, 'user_model_catalog_json');
  assert.ok(modelRefresh(result).warnings.includes('codex_model_list_pinned_by_user_model_catalog_json'));
  assert.match(await fs.readFile(setup.configPath, 'utf8'), /^model_catalog_json = "\/Users\/someone\/my-models\.json"$/m);
});

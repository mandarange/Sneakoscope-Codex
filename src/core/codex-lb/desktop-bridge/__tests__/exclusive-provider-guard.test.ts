import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderSessionPin } from '../../bridge-contracts.js';
import {
  DesktopBridgeError,
  OPENROUTER_ONLY_ROUTE_BLOCKED,
  OPENROUTER_ONLY_SUBAGENT_MODEL_BLOCKED,
  assertDesktopBridgeRouteContext,
  codexRequestIsChild,
  desktopBridgeConfigGeneration,
  prepareDesktopBridgeConfig,
  resolveAndBindDesktopBridgeRouteContext,
  resolveCodexSessionIdentity,
  validateDesktopBridgeConfig,
  type CodexSessionIdentity,
  type DesktopBridgeConfig,
  type DesktopBridgeOpenRouterOnlyConfig,
  type DesktopBridgeRouteRequest,
  type PreparedDesktopBridgeConfig,
} from '../index.js';

const SESSION = '019fd56f-d48f-7942-a560-48ad9ef47223';
const CHILD = '019fd570-1111-7942-a560-48ad9ef47999';
const LISTED = 'vendor/listed';
const UNLISTED = 'vendor/unlisted';
const MODE: DesktopBridgeOpenRouterOnlyConfig = { enabled: true, subagent_models: [LISTED] };

function turnMetadata(fields: Record<string, unknown>): string {
  return JSON.stringify({ installation_id: 'installation-fixture', session_id: SESSION, request_kind: 'turn', sandbox: 'seatbelt', ...fields });
}
const ROOT = resolveCodexSessionIdentity({
  'thread-id': SESSION, 'session-id': SESSION,
  'x-codex-turn-metadata': turnMetadata({ thread_id: SESSION, thread_source: 'user' }),
});
const SPAWNED = resolveCodexSessionIdentity({
  'thread-id': CHILD, 'session-id': SESSION,
  'x-codex-turn-metadata': turnMetadata({
    thread_id: CHILD, parent_thread_id: SESSION, parent_turn_id: `${SESSION}:turn`, subagent_kind: 'thread_spawn', thread_source: 'subagent',
  }),
});

function bridgeConfig(mode?: DesktopBridgeOpenRouterOnlyConfig | null, pins: ProviderSessionPin[] = []): DesktopBridgeConfig {
  const lb = 'http://127.0.0.1:1/backend-api/codex';
  const openrouter = 'http://127.0.0.1:2/api/v1';
  return {
    listenHost: '127.0.0.1', listenPort: 55_555,
    providerRegistry: {
      schema: 'sks.desktop-bridge-provider-registry.v1', generation: 'registry', created_at: '2026-09-27T00:00:00.000Z',
      providers: {
        'codex-lb': { provider_id: 'codex-lb', enabled: true, base_url: lb, allowed_origins: [new URL(lb).origin], auth_transport: 'x-codex-lb-api-key', credential_state: 'ready', credential_fingerprint: 'lb-fp', credential_generation: 'lb-credential', source_catalog_generation: 'lb-catalog' },
        openrouter: { provider_id: 'openrouter', enabled: true, base_url: openrouter, allowed_origins: [new URL(openrouter).origin], auth_transport: 'openrouter-bearer', credential_state: 'ready', credential_fingerprint: 'or-fp', credential_generation: 'or-credential', source_catalog_generation: 'or-catalog' },
      },
    },
    routePolicy: {
      schema: 'sks.bridge-routing-policy.v1', default_provider_id: 'openrouter', fallback: 'none',
      model_routes: {
        'gpt-lb': { provider_id: 'codex-lb', upstream_model: 'gpt-lb' },
        'codex-lb:gpt-lb': { provider_id: 'codex-lb', upstream_model: 'gpt-lb' },
        [LISTED]: { provider_id: 'openrouter', upstream_model: LISTED },
        [`openrouter:${LISTED}`]: { provider_id: 'openrouter', upstream_model: LISTED },
        [UNLISTED]: { provider_id: 'openrouter', upstream_model: UNLISTED },
        'official-model': { provider_id: 'openai', upstream_model: 'official-model' },
      },
      catalog_generation: 'catalog', policy_generation: 'policy', changed_at: '2026-09-27T00:00:00.000Z',
    },
    providerSessionPins: pins,
    resolveProviderCredential: async (providerId, generation) => ({ provider_id: providerId, generation, value: 'secret', source: 'test', fingerprint: providerId === 'codex-lb' ? 'lb-fp' : 'or-fp' }),
    clientCapabilitySha256: 'a'.repeat(64),
    allowedPathPrefixes: ['/backend-api/codex/'], allowedOrigins: ['app://codex'], connectTimeoutMs: 500, idleTimeoutMs: 5_000,
    officialPassthrough: { baseUrl: 'http://127.0.0.1:3/backend-api/codex' },
    ...(mode === undefined ? {} : { openRouterOnly: mode }),
  };
}

async function prepared(mode?: DesktopBridgeOpenRouterOnlyConfig | null, pins: ProviderSessionPin[] = [], dropRoutes: string[] = []): Promise<PreparedDesktopBridgeConfig> {
  const config = bridgeConfig(mode, pins);
  for (const model of dropRoutes) delete config.routePolicy.model_routes[model];
  return prepareDesktopBridgeConfig(config, async () => { throw new Error('loopback targets need no DNS'); });
}

function routeRequest(model: string, identity?: CodexSessionIdentity, threadId: string | null = null): DesktopBridgeRouteRequest {
  return { public_model: model, session_id: threadId, pathname: '/backend-api/codex/responses', transport: 'http', headers: {}, ...(identity ? { identity } : {}) };
}

function refusedWith(code: string) {
  return (error: unknown) => error instanceof DesktopBridgeError && error.code === code;
}

test('child classification needs explicit Codex lineage, never a thread/session mismatch alone', () => {
  assert.equal(codexRequestIsChild(ROOT), false);
  assert.equal(codexRequestIsChild(SPAWNED), true);
  assert.equal(codexRequestIsChild(undefined), false);
  // Forks and resumes also carry a thread id that differs from the session id.
  const forked = resolveCodexSessionIdentity({
    'thread-id': CHILD, 'session-id': SESSION,
    'x-codex-turn-metadata': turnMetadata({ thread_id: CHILD, forked_from_thread_id: SESSION, thread_source: 'user' }),
  });
  assert.notEqual(forked.thread_id, forked.session_id);
  assert.equal(codexRequestIsChild(forked), false);
  assert.equal(codexRequestIsChild(resolveCodexSessionIdentity({ 'thread-id': CHILD, 'session-id': SESSION })), false);

  // Each explicit signal is enough on its own, from any carrier.
  const kind = resolveCodexSessionIdentity({ 'x-codex-turn-metadata': turnMetadata({ thread_id: CHILD, subagent_kind: 'review' }) });
  assert.equal(codexRequestIsChild(kind), true);
  const body = resolveCodexSessionIdentity({ 'thread-id': CHILD }, { client_metadata: { thread_id: CHILD, parent_thread_id: SESSION } });
  assert.equal(body.parent_thread_id, SESSION);
  assert.equal(codexRequestIsChild(body), true);
  const nested = resolveCodexSessionIdentity({}, { client_metadata: { 'x-codex-turn-metadata': turnMetadata({ thread_id: CHILD, thread_source: 'subagent' }) } });
  assert.equal(nested.thread_source, 'subagent');
  assert.equal(codexRequestIsChild(nested), true);
  assert.equal(codexRequestIsChild(resolveCodexSessionIdentity({ 'x-openai-subagent': 'collab_spawn' })), true);
  assert.equal(codexRequestIsChild(resolveCodexSessionIdentity({ 'x-codex-parent-thread-id': SESSION })), true);
  // A WebSocket create has no per-turn headers: the header-named keys may ride in client_metadata.
  const headerNamed = resolveCodexSessionIdentity({ 'thread-id': CHILD }, { client_metadata: { thread_id: CHILD, 'x-codex-parent-thread-id': SESSION, 'x-openai-subagent': 'collab_spawn' } });
  assert.deepEqual([headerNamed.parent_thread_id, headerNamed.subagent_kind], [SESSION, 'collab_spawn']);
  assert.equal(codexRequestIsChild(headerNamed), true);

  // Codex compacting a thread uses that thread's own model: not a spawned child.
  assert.equal(codexRequestIsChild(resolveCodexSessionIdentity({ 'x-openai-subagent': 'compact' })), false);
  assert.equal(codexRequestIsChild(resolveCodexSessionIdentity({ 'x-openai-subagent': 'compact', 'x-codex-parent-thread-id': SESSION })), true);
});

test('lineage is read leniently and never refuses a request by itself', () => {
  const odd = resolveCodexSessionIdentity(
    { 'thread-id': CHILD, 'x-openai-subagent': ['first', 'second'], 'x-codex-turn-metadata': turnMetadata({ thread_id: CHILD, parent_thread_id: 42, subagent_kind: { thread_spawn: {} }, thread_source: 'x'.repeat(300) }) },
    { client_metadata: { 'x-codex-turn-metadata': '{not json' } },
  );
  assert.deepEqual(odd, { thread_id: CHILD, session_id: SESSION, parent_thread_id: null, subagent_kind: 'first', thread_source: null });
  // The existing identity guards are unchanged.
  assert.throws(() => resolveCodexSessionIdentity({ 'session-id': SESSION }), /bridge_codex_thread_id_missing/);
});

test('mode on: every model-carrying request must route to OpenRouter', async () => {
  const config = await prepared(MODE);
  assert.equal(assertDesktopBridgeRouteContext(routeRequest(UNLISTED, ROOT), config).provider_id, 'openrouter');
  assert.equal(assertDesktopBridgeRouteContext(routeRequest(LISTED), config).provider_id, 'openrouter');
  for (const model of ['gpt-lb', 'codex-lb:gpt-lb', 'official-model', 'unknown-model', 'Not A Model!']) {
    assert.throws(() => assertDesktopBridgeRouteContext(routeRequest(model, ROOT), config), refusedWith(OPENROUTER_ONLY_ROUTE_BLOCKED), model);
    assert.throws(() => assertDesktopBridgeRouteContext(routeRequest(model, SPAWNED), config), refusedWith(OPENROUTER_ONLY_ROUTE_BLOCKED), model);
  }
  // Model-less native endpoints keep the official passthrough Codex Desktop needs.
  const modelless = assertDesktopBridgeRouteContext({ ...routeRequest('', SPAWNED), pathname: '/backend-api/files' }, config);
  assert.equal(modelless.provider_id, 'openai');
  assert.equal(modelless.session_pin, null);
});

test('mode on: a spawned child may only name a model on the subagent list', async () => {
  const config = await prepared(MODE);
  for (const model of [LISTED, 'Vendor/LISTED', `openrouter:${LISTED}`]) {
    assert.equal(assertDesktopBridgeRouteContext(routeRequest(model, SPAWNED), config).upstream_model, LISTED, model);
  }
  assert.throws(() => assertDesktopBridgeRouteContext(routeRequest(UNLISTED, SPAWNED), config), refusedWith(OPENROUTER_ONLY_SUBAGENT_MODEL_BLOCKED));
  // An empty list admits no child model at all; root turns are unaffected.
  const empty = await prepared({ enabled: true, subagent_models: [] });
  assert.throws(() => assertDesktopBridgeRouteContext(routeRequest(LISTED, SPAWNED), empty), refusedWith(OPENROUTER_ONLY_SUBAGENT_MODEL_BLOCKED));
  assert.equal(assertDesktopBridgeRouteContext(routeRequest(LISTED, ROOT), empty).provider_id, 'openrouter');
});

test('mode on: a refused request never binds or moves a provider pin', async () => {
  const lbPin: ProviderSessionPin = {
    thread_id: SESSION, provider_id: 'codex-lb', public_model: 'gpt-lb', upstream_model: 'gpt-lb',
    catalog_generation: 'catalog', route_policy_generation: 'policy', created_at: '2026-09-27T00:00:00.000Z',
  };
  const config = await prepared(MODE, [lbPin]);
  const persisted: ProviderSessionPin[][] = [];
  config.persistProviderSessionPins = async (pins) => { persisted.push([...pins]); };
  // The thread's existing Codex-LB pin cannot carry it through the mode.
  await assert.rejects(resolveAndBindDesktopBridgeRouteContext(routeRequest('gpt-lb', ROOT, SESSION), config), refusedWith(OPENROUTER_ONLY_ROUTE_BLOCKED));
  await assert.rejects(resolveAndBindDesktopBridgeRouteContext(routeRequest(UNLISTED, SPAWNED, CHILD), config), refusedWith(OPENROUTER_ONLY_SUBAGENT_MODEL_BLOCKED));
  assert.equal(persisted.length, 0);
  assert.deepEqual(config.providerSessionPins, [lbPin]);

  const allowed = await resolveAndBindDesktopBridgeRouteContext(routeRequest(LISTED, SPAWNED, CHILD), config);
  assert.equal(allowed.session_pin?.provider_id, 'openrouter');
  assert.deepEqual(persisted.at(-1)?.map((pin) => [pin.thread_id, pin.provider_id]), [[SESSION, 'codex-lb'], [CHILD, 'openrouter']]);

  // The OpenRouter-only catalog drops the Codex-LB route the pin names: the
  // refusal names the mode, not a stale pin, and still writes nothing.
  const catalog = await prepared(MODE, [lbPin], ['gpt-lb', 'codex-lb:gpt-lb']);
  const catalogPersisted: ProviderSessionPin[][] = [];
  catalog.persistProviderSessionPins = async (pins) => { catalogPersisted.push([...pins]); };
  await assert.rejects(resolveAndBindDesktopBridgeRouteContext(routeRequest('gpt-lb', ROOT, SESSION), catalog), refusedWith(OPENROUTER_ONLY_ROUTE_BLOCKED));
  assert.equal(catalogPersisted.length, 0);
  assert.deepEqual(catalog.providerSessionPins, [lbPin]);
  // Only a pin to another provider is the mode's doing; mode off, or an
  // OpenRouter pin whose route is gone, keeps the pin error.
  const offCatalog = await prepared(null, [lbPin], ['gpt-lb', 'codex-lb:gpt-lb']);
  assert.throws(() => assertDesktopBridgeRouteContext(routeRequest('gpt-lb', ROOT, SESSION), offCatalog), refusedWith('session_pin_route_unavailable'));
  const orPin: ProviderSessionPin = { ...lbPin, thread_id: CHILD, provider_id: 'openrouter', public_model: UNLISTED, upstream_model: UNLISTED };
  const orCatalog = await prepared(MODE, [orPin], [UNLISTED]);
  assert.throws(() => assertDesktopBridgeRouteContext(routeRequest(UNLISTED, ROOT, CHILD), orCatalog), refusedWith('session_pin_route_unavailable'));
});

test('the config generation covers an enabled mode and its list, and nothing when the mode is off', () => {
  const off = desktopBridgeConfigGeneration(bridgeConfig());
  assert.equal(desktopBridgeConfigGeneration(bridgeConfig(null)), off);
  assert.equal(desktopBridgeConfigGeneration(bridgeConfig({ enabled: false, subagent_models: [LISTED] })), off);
  const on = desktopBridgeConfigGeneration(bridgeConfig(MODE));
  assert.notEqual(on, off);
  assert.notEqual(desktopBridgeConfigGeneration(bridgeConfig({ enabled: true, subagent_models: [LISTED, UNLISTED] })), on);
  assert.equal(
    desktopBridgeConfigGeneration(bridgeConfig({ enabled: true, subagent_models: [UNLISTED, LISTED] })),
    desktopBridgeConfigGeneration(bridgeConfig({ enabled: true, subagent_models: [LISTED, UNLISTED] })),
  );
});

test('mode off, absent or disabled, routes exactly as before', async () => {
  const absent = await prepared();
  const disabled = await prepared({ enabled: false, subagent_models: [] });
  const cases: Array<[string, CodexSessionIdentity, string]> = [
    ['gpt-lb', ROOT, 'codex-lb'], ['codex-lb:gpt-lb', SPAWNED, 'codex-lb'], ['official-model', ROOT, 'openai'],
    ['unknown-model', SPAWNED, 'openai'], [UNLISTED, SPAWNED, 'openrouter'], ['', SPAWNED, 'openai'],
  ];
  for (const [model, identity, provider] of cases) {
    const expected = assertDesktopBridgeRouteContext(routeRequest(model), absent);
    assert.equal(expected.provider_id, provider, model);
    assert.deepEqual(assertDesktopBridgeRouteContext(routeRequest(model, identity), absent), expected, model);
    assert.deepEqual(assertDesktopBridgeRouteContext(routeRequest(model, identity), disabled), expected, model);
  }
  assert.equal('openRouterOnly' in absent, false);
});

test('the bridge config accepts a well-formed mode and refuses a malformed one', () => {
  assert.doesNotThrow(() => validateDesktopBridgeConfig(bridgeConfig(MODE)));
  assert.doesNotThrow(() => validateDesktopBridgeConfig(bridgeConfig(null)));
  assert.doesNotThrow(() => validateDesktopBridgeConfig(bridgeConfig({ enabled: false, subagent_models: [] })));
  const malformed: unknown[] = [
    { enabled: 'yes', subagent_models: [] },
    { enabled: true, subagent_models: ['Vendor/Upper'] },
    { enabled: true, subagent_models: [LISTED, LISTED] },
    { enabled: true, subagent_models: LISTED },
    { enabled: true, subagent_models: [], extra: true },
  ];
  for (const mode of malformed) {
    assert.throws(() => validateDesktopBridgeConfig(bridgeConfig(mode as DesktopBridgeOpenRouterOnlyConfig)), refusedWith('bridge_openrouter_only_config_invalid'), JSON.stringify(mode));
  }
});

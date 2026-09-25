import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectImagegenCapability } from '../../dist/core/imagegen/imagegen-capability.js';

// Codex default mode for SKS surfaces (`sks imagegen generate`): the hosted
// image tool on the bridge route of the user's Codex model.
test('the bridge route of the Codex model makes SKS surfaces ready without the built-in tool', async (t) => {
  const env = await tempEnv(t);
  const result = await detectImagegenCapability({ codexBin: '/missing-codex', env, desktopBridgeStatus: bridgeStatus() });
  assert.equal(result.core_ready, true);
  assert.equal(result.sks_surface_generation_available, true);
  assert.deepEqual(result.codex_bridge_route, {
    available: true,
    main_model: 'gpt-6-astra',
    provider_id: 'codex-lb',
    upstream_model: 'gpt-6-astra',
    blocker: null
  });
  assert.equal(result.codex_lb.selected, true);
  assert.equal(result.codex_lb.api_key.source, 'provider-store');
  assert.deepEqual(result.blockers, []);
});

test('a bridge route SKS cannot authenticate, or a stopped bridge, is named instead of passing', async (t) => {
  const env = await tempEnv(t);
  const cases = [
    [bridgeStatus({ route: { provider_id: 'openai', upstream_model: 'gpt-6-astra' } }), 'codex_route_requires_codex_auth'],
    [bridgeStatus({ running: false }), 'desktop_bridge_not_running'],
    [bridgeStatus({ route: null }), 'catalog_model_route_missing'],
    [bridgeStatus({ credential: 'missing' }), 'bridge_route_provider_credential_unverified']
  ];
  for (const [status, blocker] of cases) {
    const result = await detectImagegenCapability({ codexBin: '/missing-codex', env, desktopBridgeStatus: status });
    assert.equal(result.codex_bridge_route.blocker, blocker);
    assert.equal(result.core_ready, false);
    assert.deepEqual(result.core_blockers, ['codex_app_builtin_imagegen_capability_missing', blocker]);
  }
});

test('codex-lb ImageGen readiness fails closed without provider-scoped capability evidence', async (t) => {
  const env = await tempEnv(t);
  const status = bridgeStatus();
  status.providers['codex-lb'].capabilities = { state: 'not_attempted', blockers: [], warnings: [], capabilities: {} };
  const result = await detectImagegenCapability({ codexBin: '/missing-codex', env, desktopBridgeStatus: status });
  assert.equal(result.codex_lb.available, false);
  assert.equal(result.codex_lb.blocker, 'codex_lb_imagegen_capability_unverified');
});

async function tempEnv(t) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-bridge-route-'));
  t.after(() => fsp.rm(home, { recursive: true, force: true }));
  await fsp.mkdir(path.join(home, '.codex'), { recursive: true });
  await fsp.writeFile(path.join(home, '.codex', 'config.toml'), 'model = "gpt-6-astra"\n');
  return { HOME: home, CODEX_HOME: path.join(home, '.codex') };
}

function bridgeStatus({ running = true, route = { provider_id: 'codex-lb', upstream_model: 'gpt-6-astra' }, credential = 'ready' } = {}) {
  return {
    schema: 'sks.desktop-bridge-status.v3',
    checked_at: '2026-09-25T00:00:00.000Z',
    service: { running },
    providers: {
      'codex-lb': {
        enabled: true,
        credential: { state: credential, source: 'provider-store', blockers: [], warnings: [] },
        endpoint: { configured: true, origin_redacted: 'https://gateway.example', auth_transport: 'authorization-bearer' },
        capabilities: { state: 'verified', blockers: [], warnings: [], capabilities: { image_generation: { state: 'verified', blockers: [], warnings: [] } } }
      }
    },
    routing: { policy: { default_provider_id: 'codex-lb', fallback: 'none', model_routes: route ? { 'gpt-6-astra': route } : {} } }
  };
}

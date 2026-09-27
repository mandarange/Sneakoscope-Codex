import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  defaultDesktopBridgeServiceSettings,
  desktopBridgeServicePaths,
  desktopBridgeServiceStatus,
  readDesktopBridgeServiceSettings,
  resolveDesktopBridgeOpenRouterOnly,
  resolveDesktopBridgeRuntimeConfig,
  writeDesktopBridgeServiceSettings
} from '../desktop-service.js';
import { createDesktopBridgePublicState, desktopBridgeConfigGeneration, validateDesktopBridgeConfig, writeDesktopBridgeState } from '../desktop-bridge/index.js';
import { openRouterOnlyStatePath, writeOpenRouterOnlyState } from '../../subagents/child-model-allowlist.js';

const CLIENT_CAPABILITY = Buffer.alloc(32, 0x52).toString('base64url');
const CLIENT_CAPABILITY_SHA256 = createHash('sha256').update(CLIENT_CAPABILITY).digest('hex');

async function fixture(t: test.TestContext) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-desktop-service-exclusive-'));
  t.after(() => fsp.rm(home, { recursive: true, force: true }));
  // Hermetic: the store resolves under this HOME only, never a CODEX_HOME from the runner.
  const env: NodeJS.ProcessEnv = { HOME: home };
  const paths = desktopBridgeServicePaths(home);
  const base = defaultDesktopBridgeServiceSettings({ listen_port: 54_331, client_capability_sha256: CLIENT_CAPABILITY_SHA256 });
  await writeDesktopBridgeServiceSettings(paths.settings_path, defaultDesktopBridgeServiceSettings({
    ...base,
    provider_registry: {
      ...base.provider_registry,
      generation: 'registry-exclusive',
      providers: {
        ...base.provider_registry.providers,
        openrouter: {
          ...base.provider_registry.providers.openrouter,
          enabled: true, credential_state: 'ready', credential_fingerprint: 'fingerprint-exclusive',
          credential_generation: 'credential-exclusive', source_catalog_generation: 'openrouter-catalog'
        }
      }
    },
    route_policy: {
      schema: 'sks.bridge-routing-policy.v1', default_provider_id: 'openrouter', fallback: 'none',
      model_routes: { 'vendor/model': { provider_id: 'openrouter', upstream_model: 'vendor/model' } },
      catalog_generation: 'catalog-exclusive', policy_generation: 'policy-exclusive', changed_at: '2026-09-27T00:00:00.000Z'
    }
  }));
  const options = {
    home, env, settingsPath: paths.settings_path, clientCapability: CLIENT_CAPABILITY,
    resolveProviderCredential: async (providerId: 'codex-lb' | 'openrouter', generation: string) => ({ provider_id: providerId, value: 'fixture-secret', source: 'test' as const, fingerprint: 'fingerprint-exclusive', generation })
  };
  const runtime = () => resolveDesktopBridgeRuntimeConfig(options);
  // Status as `sks bridge status` computes it, with launchd and the process probe stubbed.
  const status = () => desktopBridgeServiceStatus({
    ...options, platform: 'darwin', processExists: () => true,
    run: (async () => ({ code: 1, stdout: '', stderr: '', stdoutBytes: 0, stderrBytes: 0, truncated: false, timedOut: false })) as never
  });
  return { home, env, paths, runtime, status };
}

test('runtime config carries no mode while the store is absent, damaged or off', async (t) => {
  const setup = await fixture(t);
  const absent = await setup.runtime();
  assert.equal('openRouterOnly' in absent.config, false);
  const generation = desktopBridgeConfigGeneration(absent.config);

  await fsp.mkdir(path.dirname(openRouterOnlyStatePath({ home: setup.home, env: setup.env })), { recursive: true });
  await fsp.writeFile(openRouterOnlyStatePath({ home: setup.home, env: setup.env }), '{ damaged', { mode: 0o600 });
  assert.equal('openRouterOnly' in (await setup.runtime()).config, false);

  await writeOpenRouterOnlyState({ enabled: false, subagent_models: [{ model: 'vendor/model', criteria: '', reasoning_effort: null, default: true }] }, { home: setup.home, env: setup.env });
  const off = await setup.runtime();
  assert.equal('openRouterOnly' in off.config, false);
  assert.equal(desktopBridgeConfigGeneration(off.config), generation);
});

test('runtime config reads the store once into a canonical, validated mode', async (t) => {
  const setup = await fixture(t);
  await writeOpenRouterOnlyState({
    enabled: true,
    subagent_models: [
      { model: 'Vendor/Model', criteria: 'default work', reasoning_effort: null, default: true },
      { model: 'other/Coder:free', criteria: 'code', reasoning_effort: 'high', default: false }
    ]
  }, { home: setup.home, env: setup.env });
  const settingsBefore = await fsp.readFile(setup.paths.settings_path, 'utf8');
  const on = await setup.runtime();
  assert.deepEqual(on.config.openRouterOnly, { enabled: true, subagent_models: ['vendor/model', 'other/coder:free'] });
  assert.doesNotThrow(() => validateDesktopBridgeConfig(on.config));
  assert.deepEqual(resolveDesktopBridgeOpenRouterOnly({ home: setup.home, env: setup.env }), on.config.openRouterOnly);
  // The mode never lands in the bridge settings, whose key set an older bridge validates strictly.
  assert.equal(await fsp.readFile(setup.paths.settings_path, 'utf8'), settingsBefore);
  const settings = await readDesktopBridgeServiceSettings(setup.paths.settings_path);
  assert.equal(Object.keys(settings ?? {}).some((key) => /openrouter_only|subagent/i.test(key)), false);

  // Enabled with an empty list stays enabled: children then have no allowed model.
  await writeOpenRouterOnlyState({ subagent_models: [] }, { home: setup.home, env: setup.env });
  assert.deepEqual((await setup.runtime()).config.openRouterOnly, { enabled: true, subagent_models: [] });
});

test('a mode or list change the running bridge has not restarted into reads as a configuration mismatch', async (t) => {
  const setup = await fixture(t);
  const entry = { model: 'vendor/model', criteria: '', reasoning_effort: null, default: true };
  // The running bridge started with the mode off.
  const offGeneration = desktopBridgeConfigGeneration((await setup.runtime()).config);
  await writeDesktopBridgeState(setup.paths.state_path, createDesktopBridgePublicState((await setup.runtime()).config));
  assert.equal((await setup.status()).status, 'running');

  await writeOpenRouterOnlyState({ enabled: true, subagent_models: [entry] }, { home: setup.home, env: setup.env });
  const flipped = await setup.status();
  assert.equal(flipped.status, 'configuration_mismatch');
  assert.equal(flipped.ok, false);
  assert.ok(flipped.blockers.includes('bridge_config_generation_mismatch'));

  // Restarted into the mode: a later list change is a mismatch again.
  await writeDesktopBridgeState(setup.paths.state_path, createDesktopBridgePublicState((await setup.runtime()).config));
  assert.equal((await setup.status()).status, 'running');
  await writeOpenRouterOnlyState({ subagent_models: [entry, { ...entry, model: 'other/model', default: false }] }, { home: setup.home, env: setup.env });
  assert.equal((await setup.status()).status, 'configuration_mismatch');

  // Turning the mode off (list kept) returns the pre-mode generation, which the
  // bridge still running in the mode no longer matches.
  await writeOpenRouterOnlyState({ enabled: false }, { home: setup.home, env: setup.env });
  assert.equal(desktopBridgeConfigGeneration((await setup.runtime()).config), offGeneration);
  assert.equal((await setup.status()).status, 'configuration_mismatch');
});

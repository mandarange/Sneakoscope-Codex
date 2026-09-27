import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type test from 'node:test';
import { executeDesktopBridgeCommandV3 } from '../desktop-controller-v3.js';
import type { DesktopBridgeCommandResult } from '../bridge-contracts.js';
import {
  activateCombinedBridgeCatalog,
  bridgeRouteIndexPath,
  buildCombinedBridgeCatalog,
  combinedBridgeCatalogPath,
  readActiveCombinedBridgeCatalog
} from '../combined-catalog.js';
import { BRIDGE_MODEL_SELECTION_SCHEMA, writeBridgeModelSelection } from '../combined-catalog/model-selection.js';
import {
  configureProviderCredential,
  recordProviderCredentialValidation,
  resolveAllProviderCredentials,
  resolveAllProviderCredentialsWithValidation
} from '../provider-credentials.js';
import { resolveBridgeProviderRegistry } from '../provider-registry.js';
import { bridgeRoutePolicyPath, buildBridgeRoutingPolicy, readBridgeRoutingPolicy, writeBridgeRoutingPolicy } from '../provider-route-policy.js';
import {
  DESKTOP_BRIDGE_SERVICE_SCHEMA,
  desktopBridgeServicePaths,
  readDesktopBridgeServiceSettings,
  type DesktopBridgeServiceStatus
} from '../desktop-service.js';
import { readOpenRouterOnlyStateSync } from '../../subagents/child-model-allowlist.js';
import type { DesktopBridgeControllerV3Options } from '../desktop-controller-v3/types.js';

/**
 * Hermetic controller fixture for the OpenRouter Only Mode suites: a temp HOME
 * with both providers configured and validated, an activated combined catalog,
 * a codex-lb default route policy, and injected fetch/launchd/Codex seams.
 */
export const CHECKED_AT = '2026-09-27T00:00:00.000Z';
export const OR_MODELS = ['vendor-a/model-one', 'vendor-b/model-two', 'vendor-c/model-three', 'vendor-d/list-only'];
export const LB_MODELS = ['gpt-6-astra', 'lb-mutation-model'];

export type Setup = Awaited<ReturnType<typeof fixture>>;

export async function fixture(t: test.TestContext, input: { openrouterValidated?: boolean; selection?: string[]; model?: string | null } = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-openrouter-only-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const codexHome = path.join(home, '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  const env = {
    HOME: home,
    SKS_HOME: path.join(home, '.sneakoscope'),
    CODEX_HOME: undefined,
    CODEX_LB_API_KEY: '',
    CODEX_LB_BASE_URL: '',
    OPENROUTER_API_KEY: '',
    SKS_OPENROUTER_API_KEY: '',
    SKS_ALLOW_CODEX_LB_TEST_HOST: '1',
    SKS_SKIP_CODEX_APP_RESTART: '1'
  } as NodeJS.ProcessEnv;
  await configureProviderCredential({ provider_id: 'codex-lb', api_key: 'lb-openrouter-only-secret-123456789', host: 'https://lb.example.test/backend-api/codex', home, processEnv: env });
  await configureProviderCredential({ provider_id: 'openrouter', api_key: 'or-openrouter-only-secret-987654321', home, processEnv: env });
  const raw = await resolveAllProviderCredentials({ codexLb: { home, processEnv: env }, openrouter: { home, processEnv: env } });
  for (const providerId of ['codex-lb', 'openrouter'] as const) {
    if (providerId === 'openrouter' && input.openrouterValidated === false) continue;
    await recordProviderCredentialValidation({ provider_id: providerId, credential: raw[providerId], state: 'ready', checked_at: CHECKED_AT, home });
  }
  const credentials = await resolveAllProviderCredentialsWithValidation({ home, codexLb: { home, processEnv: env }, openrouter: { home, processEnv: env } });
  const registry = await resolveBridgeProviderRegistry({ home, credentials });
  const build = buildCombinedBridgeCatalog(registry, {
    catalogs: {
      'codex-lb': { provider_id: 'codex-lb', state: 'verified', generation: 'lb-gen', models: { models: LB_MODELS.map((slug) => ({ slug, display_name: slug })) } },
      openrouter: { provider_id: 'openrouter', state: 'verified', generation: 'or-gen', models: OR_MODELS.map((id) => ({ id, name: id })) }
    },
    created_at: CHECKED_AT
  });
  const activation = await activateCombinedBridgeCatalog({ build, catalogPath: combinedBridgeCatalogPath(codexHome), routeIndexPath: bridgeRouteIndexPath(codexHome) });
  assert.equal(activation.activated, true, JSON.stringify(activation.blockers));
  const policy = buildBridgeRoutingPolicy({ route_index: build.route_index, catalog_generation: build.catalog.generation, default_provider_id: 'codex-lb', changed_at: CHECKED_AT });
  await writeBridgeRoutingPolicy(bridgeRoutePolicyPath(codexHome), policy, build.route_index);
  await writeBridgeModelSelection(home, {
    schema: BRIDGE_MODEL_SELECTION_SCHEMA,
    updated_at: CHECKED_AT,
    openrouter: { mode: 'selected', public_ids: input.selection ?? ['vendor-a/model-one', 'vendor-b/model-two'] }
  });
  const model = input.model === undefined ? 'gpt-6-astra' : input.model;
  await fs.writeFile(path.join(codexHome, 'config.toml'), model === null ? '' : `model = "${model}"\n`);
  return { home, codexHome, env, configPath: path.join(codexHome, 'config.toml') };
}

export function serviceStatus(home: string, running: boolean): DesktopBridgeServiceStatus {
  return {
    schema: DESKTOP_BRIDGE_SERVICE_SCHEMA, ok: running, supported: true, installed: true, loaded: running, running,
    status: running ? 'running' : 'missing', service: 'gui/501/com.sneakoscope.desktop-bridge',
    paths: desktopBridgeServicePaths(home), state: null, settings: null, expected_config_generation: null,
    credential_source: null, blockers: []
  };
}

export function runtime(setup: Setup, overrides: { running?: boolean; env?: NodeJS.ProcessEnv; restartOk?: boolean } = {}) {
  const fetched: string[] = [];
  const codexRestarts: string[] = [];
  const bootstraps: string[] = [];
  const control = { failOpenRouter: false };
  const running = overrides.running ?? true;
  const options: DesktopBridgeControllerV3Options = {
    home: setup.home,
    env: { ...setup.env, ...(overrides.env || {}) },
    platform: 'darwin',
    serviceStatusImpl: async () => serviceStatus(setup.home, running),
    stopServiceImpl: async () => serviceStatus(setup.home, false),
    bootstrapServiceImpl: async () => { bootstraps.push('bootstrap'); return serviceStatus(setup.home, true); },
    codexLbLookup: async () => [{ address: '93.184.216.34', family: 4 as const }],
    fetchImpl: async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      fetched.push(url);
      if (control.failOpenRouter && url.includes('openrouter.ai')) return new Response('{}', { status: 500 });
      const ids = url.includes('openrouter.ai') ? OR_MODELS : LB_MODELS;
      return new Response(JSON.stringify({ data: ids.map((id) => ({ id, name: id })) }), { status: 200 });
    },
    codexAppRunningImpl: async () => true,
    codexAppRestartImpl: async () => {
      codexRestarts.push('restart');
      return overrides.restartOk === false
        ? { schema: 'sks.codex-app-restart.v1', ok: false, status: 'relaunch_failed', app_name: 'ChatGPT', blockers: ['codex_app_relaunch_failed'] }
        : { schema: 'sks.codex-app-restart.v1', ok: true, status: 'restarted', app_name: 'ChatGPT', blockers: [] };
    },
    now: () => new Date(CHECKED_AT),
    id: () => 'openrouter-only'
  };
  return { options, fetched, codexRestarts, bootstraps, control };
}

export function store(setup: Setup) {
  return readOpenRouterOnlyStateSync({ home: setup.home, env: { HOME: setup.home } });
}

export async function policyDefault(setup: Setup) {
  return (await readBridgeRoutingPolicy(bridgeRoutePolicyPath(setup.codexHome))).policy?.default_provider_id;
}

export async function run(request: Parameters<typeof executeDesktopBridgeCommandV3>[0], options: DesktopBridgeControllerV3Options): Promise<DesktopBridgeCommandResult> {
  const result = await executeDesktopBridgeCommandV3(request, options);
  assert.equal(result.schema, 'sks.desktop-bridge-command-result.v1');
  return result as DesktopBridgeCommandResult;
}

export function openRouterOnly(result: DesktopBridgeCommandResult): Record<string, any> {
  const value = result.result.openrouter_only as Record<string, any> | undefined;
  assert.ok(value, JSON.stringify(result.result));
  return value;
}

export async function catalogView(setup: Setup) {
  const active = await readActiveCombinedBridgeCatalog(combinedBridgeCatalogPath(setup.codexHome), bridgeRouteIndexPath(setup.codexHome));
  assert.equal(active.ok, true);
  return {
    models: active.catalog.models.map((model) => `${model.provider_id}:${model.public_id}`).sort(),
    routeProviders: [...new Set(Object.values(active.route_index.routes).map((route) => route.provider_id))].sort()
  };
}

export async function configModel(setup: Setup): Promise<string[]> {
  return (await fs.readFile(setup.configPath, 'utf8')).split('\n').filter((line) => /^\s*model\s*=/.test(line));
}

export async function authPriorityEnabled(setup: Setup): Promise<boolean | undefined> {
  return (await readDesktopBridgeServiceSettings(desktopBridgeServicePaths(setup.home).settings_path))?.auth_priority_enabled;
}

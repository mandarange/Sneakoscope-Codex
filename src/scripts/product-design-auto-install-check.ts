#!/usr/bin/env node
// @ts-nocheck
import { ensureProductDesignPluginInstalledWithRequest, findProductDesignPluginSummaryFromMarketplaces, productDesignAutoInstallRequested } from '../core/product-design-app-server.js';
import { PRODUCT_DESIGN_PLUGIN, PRODUCT_DESIGN_REQUIRED_SKILLS } from '../core/product-design-plugin.js';
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

function pluginReadResponse({ installed, enabled }) {
  return {
    plugin: {
      marketplaceName: PRODUCT_DESIGN_PLUGIN.marketplace,
      marketplacePath: null,
      summary: {
        id: PRODUCT_DESIGN_PLUGIN.id,
        remotePluginId: PRODUCT_DESIGN_PLUGIN.remote_plugin_id,
        name: PRODUCT_DESIGN_PLUGIN.name,
        installed,
        enabled,
        interface: {
          displayName: PRODUCT_DESIGN_PLUGIN.display_name
        }
      },
      skills: PRODUCT_DESIGN_REQUIRED_SKILLS.map((name) => ({ name, enabled: true }))
    }
  };
}

let installed = false;
const installCalls = [];
const installResult = await ensureProductDesignPluginInstalledWithRequest(async (method, params) => {
  installCalls.push({ method, params });
  if (method === 'plugin/read') return pluginReadResponse({ installed, enabled: installed });
  if (method === 'plugin/install') {
    assertGate(params.pluginName === PRODUCT_DESIGN_PLUGIN.remote_plugin_id, 'plugin/install must use Product Design remote plugin id', params);
    installed = true;
    return { authPolicy: 'ON_USE', appsNeedingAuth: [] };
  }
  if (method === 'plugin/installed') return { marketplaces: [], marketplaceLoadErrors: [] };
  throw new Error(`unexpected method: ${method}`);
}, { autoInstallProductDesign: true, env: {} });

assertGate(installResult.ok, 'Product Design ensure must pass after fake plugin/install', installResult);
assertGate(installResult.install_attempted === true, 'Product Design ensure must attempt install when read evidence is not ready', installResult);
assertGate(installCalls.some((call) => call.method === 'plugin/install'), 'Product Design ensure did not call plugin/install', installCalls);
assertGate(installResult.after_evidence.ok, 'Product Design after_evidence must be ready after install', installResult);

installed = false;
const dryCalls = [];
const dryResult = await ensureProductDesignPluginInstalledWithRequest(async (method, params) => {
  dryCalls.push({ method, params });
  if (method === 'plugin/read') return pluginReadResponse({ installed: false, enabled: false });
  throw new Error(`unexpected dry method: ${method}`);
}, { autoInstallProductDesign: false, env: {} });

assertGate(!dryResult.ok, 'Product Design dry ensure must not claim ready when read evidence is not ready', dryResult);
assertGate(dryResult.install_attempted === false, 'Product Design dry ensure must not attempt install', dryResult);
assertGate(!dryCalls.some((call) => call.method === 'plugin/install'), 'Product Design dry ensure must not call plugin/install', dryCalls);

const marketplaceList = {
  marketplaces: [{
    name: PRODUCT_DESIGN_PLUGIN.marketplace,
    plugins: [{
      id: PRODUCT_DESIGN_PLUGIN.id,
      remotePluginId: PRODUCT_DESIGN_PLUGIN.remote_plugin_id,
      name: PRODUCT_DESIGN_PLUGIN.name,
      installed: true,
      enabled: true,
      interface: {
        displayName: PRODUCT_DESIGN_PLUGIN.display_name
      }
    }]
  }],
  marketplaceLoadErrors: []
};
const discovered = findProductDesignPluginSummaryFromMarketplaces(marketplaceList);
assertGate(discovered?.remotePluginId === PRODUCT_DESIGN_PLUGIN.remote_plugin_id, 'Product Design vertical plugin/list discovery must return remote id', discovered);

let readCount = 0;
const listCalls = [];
const listFallbackResult = await ensureProductDesignPluginInstalledWithRequest(async (method, params) => {
  listCalls.push({ method, params });
  if (method === 'plugin/read') {
    readCount += 1;
    if (readCount === 1) throw new Error('simulated stale read id');
    return pluginReadResponse({ installed: true, enabled: true });
  }
  if (method === 'plugin/list') return marketplaceList;
  throw new Error(`unexpected list fallback method: ${method}`);
}, { autoInstallProductDesign: true, env: {} });

assertGate(listFallbackResult.ok, 'Product Design ensure must recover through vertical plugin/list discovery', listFallbackResult);
assertGate(listFallbackResult.install_attempted === false, 'Product Design ensure must not install when list-discovered read is already ready', listFallbackResult);
assertGate(listCalls.some((call) => call.method === 'plugin/list'), 'Product Design ensure must query vertical plugin/list when direct read fails', listCalls);
assertGate(productDesignAutoInstallRequested({ env: { SKS_PRODUCT_DESIGN_AUTO_INSTALL: '1' } }), 'Product Design auto-install env gate must be honored');

const codexAppSource = readText('src/core/codex-app.ts');
const commandSource = readText('src/commands/codex-app.ts');
const appServerSource = readText('src/core/product-design-app-server.ts');
const pkg = JSON.parse(readText('package.json'));
const releaseCheck = String(pkg.scripts?.['release:check'] || '');

for (const token of [
  'ensureProductDesignPluginInstalled',
  'PRODUCT_DESIGN_AUTO_INSTALL_ENV',
  'autoInstallProductDesign'
]) {
  assertGate(codexAppSource.includes(token) || appServerSource.includes(token), `Product Design auto-install source missing token: ${token}`);
}

for (const token of [
  'product-design',
  'ensure-product-design',
  '--check-only',
  '--install-product-design'
]) {
  assertGate(commandSource.includes(token), `sks codex-app command missing Product Design token: ${token}`);
}

assertGate(Boolean(pkg.scripts?.['codex:product-design-auto-install']), 'package script missing codex:product-design-auto-install');
assertGate(releaseCheck.includes('codex:product-design-auto-install'), 'release:check must include Product Design auto-install gate');

emitGate('codex:product-design-auto-install', {
  install_calls: installCalls.map((call) => call.method),
  dry_calls: dryCalls.map((call) => call.method),
  list_fallback_calls: listCalls.map((call) => call.method),
  env_gate: true
});

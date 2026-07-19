import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  codexLbStatus,
  reconcileCodexLbAuthConflict,
  releaseCodexLbAuthHold,
  unselectCodexLbProvider
} from '../install-helpers.js';
import {
  removeCodexLbSharedOpenAiRouting,
  upsertCodexLbSharedOpenAiRouting
} from '../install-helpers-codex-lb-config.js';

const BASE_URL = 'https://lb.example.test/backend-api/codex';
const API_KEY = 'sk-clb-fixture-not-real';
const OAUTH = `${JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'oauth-fixture-not-real' } }, null, 2)}\n`;

function providerConfig(selected = true, topLevel = '') {
  return [
    topLevel,
    selected ? 'model_provider = "codex-lb"' : '',
    '',
    '[model_providers.codex-lb]',
    'name = "openai"',
    `base_url = "${BASE_URL}"`,
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true',
    ''
  ].filter((line, index) => line || index > 1).join('\n');
}

async function fixture(t: test.TestContext, input: { selected?: boolean; topLevel?: string; authText?: string } = {}) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-routing-'));
  t.after(() => fsp.rm(home, { recursive: true, force: true }));
  const codexHome = path.join(home, '.codex');
  const configPath = path.join(codexHome, 'config.toml');
  const envPath = path.join(codexHome, 'sks-codex-lb.env');
  const authPath = path.join(codexHome, 'auth.json');
  await fsp.mkdir(codexHome, { recursive: true });
  await fsp.writeFile(configPath, providerConfig(input.selected ?? true, input.topLevel || ''));
  await fsp.writeFile(envPath, `export CODEX_LB_BASE_URL='${BASE_URL}'\nexport CODEX_LB_API_KEY='${API_KEY}'\n`, { mode: 0o600 });
  if (input.authText !== undefined) await fsp.writeFile(authPath, input.authText, { mode: 0o600 });
  return {
    home,
    configPath,
    envPath,
    authPath,
    status: { config_path: configPath, env_path: envPath, env_key_configured: true, base_url: BASE_URL }
  };
}

test('prepared unselected codex-lb credentials preserve OAuth and do not pin built-in OpenAI', async (t) => {
  const setup = await fixture(t, { selected: false, authText: OAUTH });
  const result = await reconcileCodexLbAuthConflict({ home: setup.home, status: setup.status });
  assert.equal(result.status, 'oauth_preserved');
  assert.equal(await fsp.readFile(setup.authPath, 'utf8'), OAUTH);
  assert.doesNotMatch(await fsp.readFile(setup.configPath, 'utf8'), /openai_base_url|sks-codex-lb-managed-openai-base-url/);
});

test('activation pins built-in OpenAI to codex-lb before the shared key becomes active', async (t) => {
  const setup = await fixture(t, { authText: OAUTH });
  const result = await reconcileCodexLbAuthConflict({ home: setup.home, status: setup.status, forceCodexLbApiKeyAuth: true });
  assert.equal(result.status, 'apikey_forced');
  assert.equal(result.routing_guard?.status, 'added');

  const config = await fsp.readFile(setup.configPath, 'utf8');
  const auth = JSON.parse(await fsp.readFile(setup.authPath, 'utf8'));
  assert.match(config, /# sks-codex-lb-managed-openai-base-url\nopenai_base_url = "https:\/\/lb\.example\.test\/backend-api\/codex"/);
  assert.equal(auth.OPENAI_API_KEY, API_KEY);

  const status = await codexLbStatus({
    home: setup.home,
    processEnv: {},
    securityBin: '/usr/bin/false',
    launchctlBin: '/usr/bin/false'
  });
  assert.equal(status.codex_lb_key_in_shared_auth, true);
  assert.deepEqual(status.shared_openai_routing, {
    status: 'matched',
    safe: true,
    managed: true,
    configured_base_url: BASE_URL
  });
});

test('activation fails closed on a different user-owned openai_base_url', async (t) => {
  const userOverride = 'openai_base_url = "https://user-proxy.example.test/v1"';
  const setup = await fixture(t, { topLevel: userOverride, authText: OAUTH });
  const beforeConfig = await fsp.readFile(setup.configPath, 'utf8');
  const result = await reconcileCodexLbAuthConflict({ home: setup.home, status: setup.status, forceCodexLbApiKeyAuth: true });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'shared_openai_base_url_conflict');
  assert.equal(await fsp.readFile(setup.configPath, 'utf8'), beforeConfig);
  assert.equal(await fsp.readFile(setup.authPath, 'utf8'), OAUTH);
});

test('activation rolls back its managed routing pin when auth.json cannot be written', async (t) => {
  const setup = await fixture(t);
  const blockedParent = path.join(setup.home, 'not-a-directory');
  await fsp.writeFile(blockedParent, 'blocker');
  const result = await reconcileCodexLbAuthConflict({
    home: setup.home,
    authPath: path.join(blockedParent, 'auth.json'),
    status: setup.status,
    forceCodexLbApiKeyAuth: true
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'write_failed');
  assert.equal(result.routing_rollback?.status, 'rolled_back');
  assert.doesNotMatch(await fsp.readFile(setup.configPath, 'utf8'), /openai_base_url|sks-codex-lb-managed-openai-base-url/);
});

test('unselect refuses to expose an active shared codex-lb key to built-in OpenAI', async (t) => {
  const setup = await fixture(t, { authText: OAUTH });
  const activated = await reconcileCodexLbAuthConflict({ home: setup.home, status: setup.status, forceCodexLbApiKeyAuth: true });
  assert.equal(activated.status, 'apikey_forced');
  const result = await unselectCodexLbProvider({
    home: setup.home,
    processEnv: {},
    securityBin: '/usr/bin/false'
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'shared_codex_lb_auth_active');
  assert.match(await fsp.readFile(setup.configPath, 'utf8'), /model_provider = "codex-lb"/);
});

test('release rejects keep-provider under shared auth and leaves the coherent LB state intact', async (t) => {
  const setup = await fixture(t, { authText: OAUTH });
  const activated = await reconcileCodexLbAuthConflict({ home: setup.home, status: setup.status, forceCodexLbApiKeyAuth: true });
  assert.equal(activated.status, 'apikey_forced');
  const result = await releaseCodexLbAuthHold({ home: setup.home, keepProvider: true });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'keep_provider_unsafe_with_shared_auth');
  assert.equal(JSON.parse(await fsp.readFile(setup.authPath, 'utf8')).OPENAI_API_KEY, API_KEY);
  assert.match(await fsp.readFile(setup.configPath, 'utf8'), /model_provider = "codex-lb"/);
});

test('non-forced reconcile restores OAuth only with an unselected, unpinned provider state', async (t) => {
  const setup = await fixture(t, { authText: OAUTH });
  const activated = await reconcileCodexLbAuthConflict({ home: setup.home, status: setup.status, forceCodexLbApiKeyAuth: true });
  assert.equal(activated.status, 'apikey_forced');
  const restored = await reconcileCodexLbAuthConflict({ home: setup.home, status: setup.status });
  assert.equal(restored.status, 'oauth_restored');
  assert.equal(await fsp.readFile(setup.authPath, 'utf8'), OAUTH);
  assert.doesNotMatch(await fsp.readFile(setup.configPath, 'utf8'), /model_provider = "codex-lb"|openai_base_url|sks-codex-lb-managed-openai-base-url/);
});

test('release restores OAuth, unselects codex-lb, and removes only its managed routing pin', async (t) => {
  const setup = await fixture(t, { authText: OAUTH });
  const activated = await reconcileCodexLbAuthConflict({ home: setup.home, status: setup.status, forceCodexLbApiKeyAuth: true });
  assert.equal(activated.status, 'apikey_forced');
  const result = await releaseCodexLbAuthHold({ home: setup.home });
  assert.equal(result.status, 'released');
  assert.equal(result.provider_unselected, true);
  assert.equal(await fsp.readFile(setup.authPath, 'utf8'), OAUTH);
  const config = await fsp.readFile(setup.configPath, 'utf8');
  assert.doesNotMatch(config, /model_provider = "codex-lb"|openai_base_url|sks-codex-lb-managed-openai-base-url/);
  assert.match(config, /\[model_providers\.codex-lb\]/);
});

test('routing cleanup removes only an SKS-provenanced exact pin', () => {
  const userOwned = `openai_base_url = "${BASE_URL}"\n`;
  assert.equal(removeCodexLbSharedOpenAiRouting(userOwned, BASE_URL).changed, false);

  const managed = upsertCodexLbSharedOpenAiRouting('', BASE_URL);
  assert.equal(managed.ok, true);
  assert.equal(removeCodexLbSharedOpenAiRouting(managed.text, BASE_URL).changed, true);
  assert.doesNotMatch(removeCodexLbSharedOpenAiRouting(managed.text, BASE_URL).text, /openai_base_url|sks-codex-lb-managed-openai-base-url/);
});

test('activation claims an exact matching unmanaged openai_base_url so release can clean it up', () => {
  const existing = `openai_base_url = "${BASE_URL}"\n`;
  const claimed = upsertCodexLbSharedOpenAiRouting(existing, BASE_URL);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.status, 'added');
  assert.equal(claimed.managed, true);
  assert.match(claimed.text, /# sks-codex-lb-managed-openai-base-url\nopenai_base_url = "https:\/\/lb\.example\.test\/backend-api\/codex"/);
  assert.equal(removeCodexLbSharedOpenAiRouting(claimed.text, BASE_URL).changed, true);
});

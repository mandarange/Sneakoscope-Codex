import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureCodexLb } from '../install-helpers.js';
import { hasTopLevelCodexLbSelected } from '../install-helpers-codex-lb-shared.js';
import { CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION } from '../../core/codex-lb/codex-lb-tool-output-recovery.js';
import { codexLbToolCatalogPath } from '../../core/codex-lb/codex-lb-tool-catalog.js';

const BASE_URL = 'https://lb.desktop-ui.fixture/backend-api/codex';

function gpt56Model(slug: string) {
  return {
    slug,
    display_name: slug,
    supported_reasoning_levels: [{ effort: 'medium', description: 'Balanced' }],
    shell_type: 'shell_command',
    visibility: 'list',
    supported_in_api: true,
    priority: 1,
    base_instructions: 'You are Codex.',
    supports_reasoning_summaries: true,
    support_verbosity: true,
    truncation_policy: { mode: 'tokens', limit: 10_000 },
    supports_parallel_tool_calls: true,
    experimental_supported_tools: [],
    tool_mode: 'code_mode_only',
    use_responses_lite: true,
    minimal_client_version: '0.144.5'
  };
}

const READY_CATALOG = {
  models: [
    gpt56Model('gpt-5.6-sol'),
    gpt56Model('gpt-5.6-terra'),
    gpt56Model('gpt-5.6-luna')
  ]
};

async function homeFixture(t: test.TestContext) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-desktop-ui-'));
  t.after(() => fsp.rm(home, { recursive: true, force: true }));
  const codexHome = path.join(home, '.codex');
  await fsp.mkdir(codexHome, { recursive: true });
  await fsp.writeFile(
    path.join(codexHome, 'auth.json'),
    `${JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'oauth-fixture' } }, null, 2)}\n`,
    { mode: 0o600 }
  );
  return { home, codexHome, configPath: path.join(codexHome, 'config.toml'), authPath: path.join(codexHome, 'auth.json') };
}

async function toolOutputRecoveryFetch() {
  return new Response('{}', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-app-version': CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION
    }
  });
}

test('configureCodexLb selects provider only after a ready GPT-5.6 catalog is bound', async (t) => {
  const { home, codexHome, configPath } = await homeFixture(t);
  const catalogPath = codexLbToolCatalogPath(codexHome);
  const previousSkip = process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV;
  process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV = '1';
  t.after(() => {
    if (previousSkip === undefined) delete process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV;
    else process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV = previousSkip;
  });
  const result = await configureCodexLb({
    home,
    host: BASE_URL,
    apiKey: 'sk-clb-desktop-ui-ready',
    forceCodexLbApiKeyAuth: true,
    authMode: 'codex-lb',
    shellProfile: 'skip',
    syncLaunchctl: false,
    toolOutputRecoveryFetch,
    toolCatalogFetch: async () => new Response(JSON.stringify(READY_CATALOG), { status: 200 })
  });

  const config = await fsp.readFile(configPath, 'utf8');
  assert.equal(result.ok, true);
  assert.equal(hasTopLevelCodexLbSelected(config), true);
  assert.match(config, new RegExp(`model_catalog_json\\s*=\\s*"${catalogPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.equal((await fsp.stat(catalogPath)).isFile(), true);
  const auth = await fsp.readFile(path.join(codexHome, 'auth.json'), 'utf8');
  assert.match(auth, /sk-clb-desktop-ui-ready/);
});

test('configureCodexLb does not select or force shared auth when /models catalog is bad', async (t) => {
  const { home, configPath, authPath } = await homeFixture(t);
  const previousSkip = process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV;
  process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV = '1';
  t.after(() => {
    if (previousSkip === undefined) delete process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV;
    else process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV = previousSkip;
  });
  const beforeAuth = await fsp.readFile(authPath, 'utf8');
  const result = await configureCodexLb({
    home,
    host: BASE_URL,
    apiKey: 'sk-clb-desktop-ui-bad',
    forceCodexLbApiKeyAuth: true,
    authMode: 'codex-lb',
    shellProfile: 'skip',
    syncLaunchctl: false,
    toolOutputRecoveryFetch,
    toolCatalogFetch: async () => new Response(JSON.stringify({ models: [{ id: 'gpt-4o' }] }), { status: 200 })
  });

  const config = await fsp.readFile(configPath, 'utf8');
  assert.equal(hasTopLevelCodexLbSelected(config), false);
  assert.match(config, /\[model_providers\.codex-lb\]/);
  assert.doesNotMatch(config, /^\s*model_provider\s*=\s*"codex-lb"/m);
  assert.equal(result.codex_login?.status, 'deferred_until_provider_selected');
  assert.equal(result.ok, false);
  assert.ok((result.drift || []).includes('codex_lb_gpt56_tool_catalog_not_ready'));
  assert.equal(await fsp.readFile(authPath, 'utf8'), beforeAuth);
  assert.match(beforeAuth, /chatgpt/);
});

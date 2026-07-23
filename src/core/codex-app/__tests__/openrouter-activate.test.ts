import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { openRouterStatus, useOpenRouter } from '../openrouter-activate.js';
import { OPENROUTER_DEFAULT_MODEL, OPENROUTER_PROVIDER_ID, openRouterAuthCommandArgs } from '../openrouter-provider.js';
import { openRouterSecretPaths, writeStoredOpenRouterKey } from '../../providers/openrouter/openrouter-secret-store.js';
import { ensureStoredOpenRouterProviderDuringInstall } from '../../../cli/install-helpers-codex-lb-config.js';
import { validateCodexConfigRoundTrip } from '../../codex/codex-config-toml.js';

const execFile = promisify(execFileCallback);

async function makeTempOpenRouterHarness() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-openrouter-activate-'));
  const root = path.join(temp, 'repo');
  const home = path.join(temp, 'home');
  const sksHome = path.join(temp, 'sks-home');
  const configPath = path.join(home, '.codex', 'config.toml');
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const env = {
    HOME: home,
    SKS_HOME: sksHome,
    OPENROUTER_API_KEY: 'or-test-key-openrouter-activate',
    SKS_SKIP_CODEX_APP_RESTART: '1'
  } as NodeJS.ProcessEnv;
  return { temp, root, home, configPath, env };
}

test('openRouterStatus reports missing key and provider before activation', async (t) => {
  const { temp, home, configPath, env } = await makeTempOpenRouterHarness();
  t.after(async () => {
    await fs.rm(temp, { recursive: true, force: true });
  });
  delete env.OPENROUTER_API_KEY;
  await fs.writeFile(configPath, '', 'utf8');

  const status = await openRouterStatus({ home, configPath, env });
  assert.equal(status.ok, false);
  assert.equal(status.key_present, false);
  assert.equal(status.provider_present, false);
  assert.equal(status.selected, false);
  assert.ok(status.blockers.includes('openrouter_key_missing'));
  assert.ok(status.blockers.includes('openrouter_provider_missing'));
});

test('useOpenRouter installs provider, selects OpenRouter model, and openRouterStatus agrees', async (t) => {
  const { temp, root, home, configPath, env } = await makeTempOpenRouterHarness();
  t.after(async () => {
    await fs.rm(temp, { recursive: true, force: true });
  });

  const missingKey = await useOpenRouter({
    root,
    home,
    configPath,
    env: { ...env, OPENROUTER_API_KEY: '' },
    model: OPENROUTER_DEFAULT_MODEL,
    restartApp: false
  });
  assert.equal(missingKey.ok, false);
  assert.deepEqual(missingKey.blockers, ['openrouter_key_missing']);

  const invalidModel = await useOpenRouter({
    root,
    home,
    configPath,
    env,
    model: '!!!bad!!!',
    restartApp: false
  });
  assert.equal(invalidModel.ok, false);
  assert.deepEqual(invalidModel.blockers, ['openrouter_model_invalid']);

  const storedKey = 'sk-or-v1-stored-desktop-auth-abcdefghijklmnop';
  await writeStoredOpenRouterKey(storedKey, { paths: openRouterSecretPaths(env) });
  delete env.OPENROUTER_API_KEY;

  const activated = await useOpenRouter({
    root,
    home,
    configPath,
    env,
    model: OPENROUTER_DEFAULT_MODEL,
    restartApp: false
  });
  assert.equal(activated.ok, true, JSON.stringify(activated.blockers || activated));
  assert.equal(activated.status, 'active');
  assert.equal(activated.model, OPENROUTER_DEFAULT_MODEL);

  const config = await fs.readFile(configPath, 'utf8');
  assert.match(config, new RegExp(`model_provider\\s*=\\s*"${OPENROUTER_PROVIDER_ID}"`));
  assert.match(config, new RegExp(`model\\s*=\\s*"${OPENROUTER_DEFAULT_MODEL.replace('/', '\\/')}"`));
  assert.match(config, /\[model_providers\.openrouter\]/);
  assert.match(config, /\[model_providers\.openrouter\.auth\]/);
  assert.match(config, /command\s*=\s*"\/bin\/sh"/);
  assert.doesNotMatch(config, /^\s*env_key\s*=/m);
  assert.match(config, new RegExp(JSON.stringify(path.join(env.SKS_HOME!, 'secrets', 'openrouter-api-key')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(config.includes(storedKey), false);
  const tokenCommand = await execFile('/bin/sh', [...openRouterAuthCommandArgs(openRouterSecretPaths(env).keyPath)], { env: {} });
  assert.equal(tokenCommand.stdout.trim(), storedKey);
  assert.doesNotMatch(config, /\[profiles\.sks-glm-52-/);

  const status = await openRouterStatus({ home, configPath, env });
  assert.equal(status.ok, true);
  assert.equal(status.key_present, true);
  assert.equal(status.provider_present, true);
  assert.equal(status.provider_env_key_present, false);
  assert.equal(status.provider_auth_present, true);
  assert.equal(status.provider_auth_conflict, false);
  assert.equal(status.provider_auth_valid, true);
  assert.equal(status.selected, true);
  assert.equal(status.model, OPENROUTER_DEFAULT_MODEL);
  assert.equal(status.model_source, 'config');
});

test('useOpenRouter reports config_applied independently from restart failure', async (t) => {
  const { temp, root, home, configPath, env } = await makeTempOpenRouterHarness();
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));
  const result = await useOpenRouter({
    root,
    home,
    configPath,
    env,
    model: OPENROUTER_DEFAULT_MODEL,
    restartApp: true,
    restartImpl: async () => ({
      schema: 'sks.codex-app-restart.v1',
      ok: false,
      status: 'blocked',
      app_name: 'Codex',
      blockers: ['fixture_restart_failed']
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.config_applied, true);
  assert.equal(result.restart_ok, false);
  assert.equal(result.status, 'active_restart_blocked');
  assert.deepEqual(result.blockers, []);
  assert.ok((result.warnings as string[]).includes('restart:fixture_restart_failed'));
});

test('upgrade repair adds stored-key auth to an existing OpenRouter provider without selecting it', async (t) => {
  const { temp, home, configPath, env } = await makeTempOpenRouterHarness();
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));
  delete env.OPENROUTER_API_KEY;
  const storedKey = 'sk-or-v1-upgrade-repair-abcdefghijklmnop';
  await writeStoredOpenRouterKey(storedKey, { paths: openRouterSecretPaths(env) });
  await fs.writeFile(configPath, [
    'model = "openai/gpt-5.6-sol"',
    'model_provider = "openai"',
    '',
    '[model_providers.openrouter]',
    'name = "OpenRouter"',
    'base_url = "https://openrouter.ai/api/v1"',
    'wire_api = "responses"',
    'env_key = "OPENROUTER_API_KEY"',
    'requires_openai_auth = false',
    ''
  ].join('\n'));

  const repaired = await ensureStoredOpenRouterProviderDuringInstall({ home, configPath, env });
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(repaired.key_present, true);
  assert.equal(repaired.key_source, 'user-secret-store');
  const config = await fs.readFile(configPath, 'utf8');
  assert.match(config, /model\s*=\s*"openai\/gpt-5\.6-sol"/);
  assert.match(config, /model_provider\s*=\s*"openai"/);
  assert.match(config, /\[model_providers\.openrouter\.auth\]/);
  assert.match(config, /command\s*=\s*"\/bin\/sh"/);
  assert.doesNotMatch(config, /^\s*env_key\s*=/m);
  assert.equal(validateCodexConfigRoundTrip(config).ok, true);
  assert.equal(config.includes(storedKey), false);

  const status = await openRouterStatus({ home, configPath, env });
  assert.equal(status.key_present, true);
  assert.equal(status.provider_present, true);
  assert.equal(status.provider_auth_present, true);
  assert.equal(status.selected, false);

  const repairedAgain = await ensureStoredOpenRouterProviderDuringInstall({ home, configPath, env });
  assert.equal(repairedAgain.ok, true, JSON.stringify(repairedAgain));
  assert.equal(repairedAgain.status, 'present');
  assert.equal((repairedAgain as { repair?: { changed?: boolean; backup_path?: string | null } }).repair?.changed, false);
  assert.equal((repairedAgain as { repair?: { changed?: boolean; backup_path?: string | null } }).repair?.backup_path, null);
  assert.equal(await fs.readFile(configPath, 'utf8'), config);
});

test('OpenRouter status and shared config validation reject env_key plus command auth', async (t) => {
  const { temp, home, configPath, env } = await makeTempOpenRouterHarness();
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));
  const storedKey = 'sk-or-v1-conflict-detection-abcdefghijklmnop';
  await writeStoredOpenRouterKey(storedKey, { paths: openRouterSecretPaths(env) });
  delete env.OPENROUTER_API_KEY;
  const authArgs = openRouterAuthCommandArgs(openRouterSecretPaths(env).keyPath);
  const config = [
    '[model_providers.openrouter]',
    'name = "OpenRouter"',
    'base_url = "https://openrouter.ai/api/v1"',
    'wire_api = "responses"',
    'env_key = "OPENROUTER_API_KEY"',
    'requires_openai_auth = false',
    '',
    '[model_providers.openrouter.auth]',
    'command = "/bin/sh"',
    `args = [${authArgs.map((value) => JSON.stringify(value)).join(', ')}]`,
    'timeout_ms = 5000',
    'refresh_interval_ms = 300000',
    ''
  ].join('\n');
  await fs.writeFile(configPath, config, 'utf8');

  const validation = validateCodexConfigRoundTrip(config);
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.blockers, ['model_provider_auth_env_key_conflict:openrouter']);

  const status = await openRouterStatus({ home, configPath, env });
  assert.equal(status.ok, false);
  assert.equal(status.provider_env_key_present, true);
  assert.equal(status.provider_auth_present, true);
  assert.equal(status.provider_auth_conflict, true);
  assert.equal(status.provider_auth_valid, false);
  assert.ok(status.blockers.includes('openrouter_provider_auth_env_key_conflict'));
});

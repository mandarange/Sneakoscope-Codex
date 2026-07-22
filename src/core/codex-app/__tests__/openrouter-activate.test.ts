import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openRouterStatus, useOpenRouter } from '../openrouter-activate.js';
import { OPENROUTER_DEFAULT_MODEL, OPENROUTER_PROVIDER_ID } from '../openrouter-provider.js';

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
  assert.doesNotMatch(config, /\[profiles\.sks-glm-52-/);

  const status = await openRouterStatus({ home, configPath, env });
  assert.equal(status.ok, true);
  assert.equal(status.key_present, true);
  assert.equal(status.provider_present, true);
  assert.equal(status.selected, true);
  assert.equal(status.model, OPENROUTER_DEFAULT_MODEL);
  assert.equal(status.model_source, 'config');
});

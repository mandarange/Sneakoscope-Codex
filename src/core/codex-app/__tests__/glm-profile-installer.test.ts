import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { doctorCodexAppGlmProfile, installCodexAppGlmProfile } from '../glm-profile-installer.js';

test('GLM profile installer ensures OpenRouter provider and strips retired Desktop profiles', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-codex-app-'));
  t.after(async () => {
    await fs.rm(temp, { recursive: true, force: true });
  });
  const root = path.join(temp, 'repo');
  const home = path.join(temp, 'home');
  const configPath = path.join(home, '.codex', 'config.toml');
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, [
    '[profiles.sks-glm-52-mad]',
    'model_provider = "openrouter"',
    'model = "z-ai/glm-5.2"',
    'model_reasoning_effort = "none"',
    'service_tier = "default"',
    'approval_policy = "on-request"',
    '',
    '[profiles.sks-glm-52-high]',
    'model_provider = "openrouter"',
    'model = "z-ai/glm-5.2"',
    'model_reasoning_effort = "high"',
    'service_tier = "default"',
    'approval_policy = "on-request"',
    ''
  ].join('\n'), 'utf8');
  const env = {
    HOME: home,
    SKS_HOME: path.join(temp, 'sks-home'),
    OPENROUTER_API_KEY: 'or-test-key'
  } as NodeJS.ProcessEnv;

  const install = await installCodexAppGlmProfile({
    root,
    home,
    configPath,
    env,
    apply: true
  });
  assert.equal(install.ok, true);
  assert.equal(install.status, 'removed');
  assert.equal(install.codex_config_profile, 'sks-openrouter-default');
  assert.equal(install.config_status.ok, true);
  assert.deepEqual(install.config_status.retired_profiles_remaining, []);

  const config = await fs.readFile(configPath, 'utf8');
  assert.match(config, /\[model_providers\.openrouter\]/);
  assert.match(config, /^wire_api = "responses"$/m);
  assert.doesNotMatch(config, /^\s*env_key\s*=/m);
  assert.match(config, /\[model_providers\.openrouter\.auth\]/);
  assert.doesNotMatch(config, /\[profiles\.sks-glm-52-/);

  const doctor = await doctorCodexAppGlmProfile({ root, home, configPath, env });
  assert.equal(doctor.ok, true);
  assert.equal(doctor.status, 'valid');
});

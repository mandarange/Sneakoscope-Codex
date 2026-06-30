import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { doctorCodexAppGlmProfile, installCodexAppGlmProfile } from '../glm-profile-installer.js';

test('GLM profile installer writes Codex Desktop OpenRouter provider and reasoning profiles', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-codex-app-'));
  t.after(async () => {
    await fs.rm(temp, { recursive: true, force: true });
  });
  const root = path.join(temp, 'repo');
  const home = path.join(temp, 'home');
  const configPath = path.join(home, '.codex', 'config.toml');
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
  assert.equal(install.status, 'installed');
  assert.equal(install.codex_config_profile, 'sks-glm-52-mad');
  assert.equal(install.config_status.ok, true);

  const config = await fs.readFile(configPath, 'utf8');
  assert.match(config, /\[model_providers\.openrouter\]/);
  assert.match(config, /^wire_api = "responses"$/m);
  assert.match(config, /^env_key = "OPENROUTER_API_KEY"$/m);
  assert.match(config, /\[profiles\.sks-glm-52-mad\][\s\S]*model = "z-ai\/glm-5\.2"[\s\S]*model_reasoning_effort = "none"/);
  assert.match(config, /\[profiles\.sks-glm-52-high\][\s\S]*model_reasoning_effort = "high"/);
  assert.match(config, /\[profiles\.sks-glm-52-xhigh\][\s\S]*model_reasoning_effort = "xhigh"/);

  const doctor = await doctorCodexAppGlmProfile({ root, home, configPath, env });
  assert.equal(doctor.ok, true);
  assert.equal(doctor.status, 'valid');
});

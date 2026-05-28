import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('enableMadHighProfile migrates legacy profile table to Codex 0.134 profile file', async () => {
  const mod = await import('../../dist/core/auto-review.js');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-profile-'));
  const codexHome = path.join(home, '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  const configPath = path.join(codexHome, 'config.toml');
  await fs.writeFile(configPath, [
    'profile = "sks-mad-high"',
    'model = "gpt-5.5"',
    '',
    '[profiles.sks-mad-high]',
    'model_reasoning_effort = "high"',
    '',
    '[features]',
    'hooks = true',
    ''
  ].join('\n'));

  const result = await mod.enableMadHighProfile({ env: { HOME: home } });
  const config = await fs.readFile(configPath, 'utf8');
  const profile = await fs.readFile(path.join(codexHome, 'sks-mad-high.config.toml'), 'utf8');

  assert.equal(result.profile_config_path, path.join(codexHome, 'sks-mad-high.config.toml'));
  assert.doesNotMatch(config, /^profile\s*=\s*"sks-mad-high"/m);
  assert.doesNotMatch(config, /^\[profiles\.sks-mad-high\]/m);
  assert.match(config, /^\[features\]/m);
  assert.match(profile, /^sandbox_mode\s*=\s*"danger-full-access"/m);
  assert.match(profile, /^approval_policy\s*=\s*"never"/m);
  assert.match(profile, /^approvals_reviewer\s*=\s*"auto_review"/m);
  assert.ok(result.launch_args.includes('-c'));
  assert.ok(result.launch_args.includes('service_tier=fast'));
});

test('enableAutoReview writes profile files instead of legacy profile tables', async () => {
  const mod = await import('../../dist/core/auto-review.js');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-auto-profile-'));
  const codexHome = path.join(home, '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), '[profiles.sks-auto-review]\napprovals_reviewer = "guardian_subagent"\n');

  const status = await mod.enableAutoReview({ env: { HOME: home } });
  const config = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8');
  const profile = await fs.readFile(path.join(codexHome, 'sks-auto-review.config.toml'), 'utf8');
  const highProfile = await fs.readFile(path.join(codexHome, 'sks-auto-review-high.config.toml'), 'utf8');

  assert.equal(status.profile, true);
  assert.equal(status.high_profile, true);
  assert.doesNotMatch(config, /^\[profiles\.sks-auto-review\]/m);
  assert.match(profile, /^model_reasoning_effort\s*=\s*"medium"/m);
  assert.match(highProfile, /^model_reasoning_effort\s*=\s*"high"/m);
});

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
    'model = "future-codex-model"',
    '',
    '[profiles.sks-mad-high]',
    'model_reasoning_effort = "high"',
    '',
    '[features]',
    'hooks = true',
    ''
  ].join('\n'));

  const result = await mod.enableMadHighProfile({ env: { HOME: home }, allowUserConfigWrite: true });
  const config = await fs.readFile(configPath, 'utf8');
  const profile = await fs.readFile(path.join(codexHome, 'sks-mad-high.config.toml'), 'utf8');

  assert.equal(result.profile_config_path, path.join(codexHome, 'sks-mad-high.config.toml'));
  assert.doesNotMatch(config, /^profile\s*=\s*"sks-mad-high"/m);
  assert.doesNotMatch(config, /^\[profiles\.sks-mad-high\]/m);
  assert.match(config, /^\[features\]/m);
  assert.match(config, /^model\s*=\s*"future-codex-model"/m);
  assert.match(profile, /^sandbox_mode\s*=\s*"danger-full-access"/m);
  assert.match(profile, /^approval_policy\s*=\s*"never"/m);
  assert.match(profile, /^approvals_reviewer\s*=\s*"auto_review"/m);
  assert.match(profile, /^model_reasoning_effort\s*=\s*"xhigh"/m);
  assert.doesNotMatch(profile, /^model\s*=/m);
  assert.ok(result.launch_args.includes('-c'));
  assert.ok(result.launch_args.includes('service_tier=fast'));
  assert.ok(result.launch_args.includes('model_reasoning_effort=xhigh'));
});

test('sks --mad launch-only profile defaults reasoning to xhigh without config writes', async () => {
  const mod = await import('../../dist/core/auto-review.js');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-nowrite-'));

  const result = mod.buildMadHighLaunchProfileNoWrite({ env: { HOME: home } });

  assert.equal(result.profile_name, 'sks-mad-high');
  assert.equal(result.writes_user_codex_config, false);
  assert.equal(result.model_reasoning_effort, 'xhigh');
  assert.ok(result.launch_args.includes('model_reasoning_effort=xhigh'));
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
  assert.doesNotMatch(profile, /^model\s*=/m);
  assert.doesNotMatch(highProfile, /^model\s*=/m);
});

test('sks-fast-high profile is sandbox-neutral so Codex App permissions selector wins', async () => {
  const mod = await import('../../dist/core/auto-review.js');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-profile-'));
  const codexHome = path.join(home, '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  const configPath = path.join(codexHome, 'config.toml');
  await fs.writeFile(configPath, [
    'model = "future-codex-model"',
    '',
    '[profiles.sks-fast-high]',
    'service_tier = "fast"',
    ''
  ].join('\n'));

  const result = await mod.migrateSksProfilesToPerFile({ env: { HOME: home }, configPath });
  const config = await fs.readFile(configPath, 'utf8');
  const fastProfile = await fs.readFile(path.join(codexHome, 'sks-fast-high.config.toml'), 'utf8');

  assert.ok(result.tables_stripped.includes('sks-fast-high'));
  assert.doesNotMatch(config, /^\[profiles\.sks-fast-high\]/m);
  assert.match(config, /^model\s*=\s*"future-codex-model"/m);
  assert.match(fastProfile, /^service_tier\s*=\s*"fast"/m);
  assert.match(fastProfile, /^model_reasoning_effort\s*=\s*"high"/m);
  assert.doesNotMatch(fastProfile, /^sandbox_mode\s*=/m);
  assert.doesNotMatch(fastProfile, /^model\s*=/m);
});

test('profile migration removes stale model and provider pins from every SKS overlay', async () => {
  const mod = await import('../../dist/core/auto-review.js');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-profile-catalog-pass-through-'));
  const codexHome = path.join(home, '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  const configPath = path.join(codexHome, 'config.toml');
  await fs.writeFile(configPath, '[features]\nfast_mode = true\n');
  await fs.writeFile(path.join(codexHome, 'sks-team.config.toml'), [
    'model = "stale-pinned-model"',
    'model_provider = "stale-provider"',
    'model_reasoning_effort = "medium"',
    ''
  ].join('\n'));

  await mod.migrateSksProfilesToPerFile({ env: { HOME: home }, configPath });
  const profile = await fs.readFile(path.join(codexHome, 'sks-team.config.toml'), 'utf8');

  assert.doesNotMatch(profile, /^(?:model|model_provider)\s*=/m);
  assert.match(profile, /^model_reasoning_effort\s*=\s*"medium"/m);
});

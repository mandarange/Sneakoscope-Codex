import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('codex config readability proves node and spawned child can read project config', async () => {
  const mod = await import('../../dist/core/codex/codex-config-readability.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-config-readable-'));
  await fs.mkdir(path.join(root, '.codex'), { recursive: true });
  await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
  await fs.writeFile(path.join(root, '.codex', 'config.toml'), 'model = "gpt-5.5"\nservice_tier = "fast"\n');

  const report = await mod.inspectCodexConfigReadability(root);
  assert.equal(report.ok, true);
  assert.equal(report.schema, 'sks.codex-config-readability.v1');
  assert.equal(report.checks.find((check) => check.name === 'node_process_read')?.ok, true);
  assert.equal(report.checks.find((check) => check.name === 'spawned_child_read')?.ok, true);
});

test('project config policy splitter moves machine-local config with backup', async () => {
  const mod = await import('../../dist/core/codex/codex-project-config-policy.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-config-policy-'));
  const codexHome = path.join(root, 'home', '.codex');
  await fs.mkdir(path.join(root, '.codex'), { recursive: true });
  await fs.writeFile(path.join(root, '.codex', 'config.toml'), [
    'profile = "sks-mad-high"',
    'approval_policy = "on-failure"',
    'sandbox_mode = "workspace-write"',
    '',
    '[profiles.sks-mad-high]',
    'model_reasoning_effort = "high"',
    '',
    '[model_providers.codex-lb]',
    'base_url = "https://lb.example.test"',
    ''
  ].join('\n'));

  const report = await mod.splitCodexProjectConfigPolicy(root, { apply: true, codexHome });
  const project = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8');
  // Machine-local keys AND profile tables are merged into the single CODEX_HOME
  // config.toml (the file Codex actually loads). Codex does not auto-read a
  // separate `<profile>.config.toml`, so the splitter intentionally keeps
  // profile_config_path null and folds `[profiles.*]` into the user config.
  const user = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8');

  assert.equal(report.ok, true);
  assert.ok(report.backup_path);
  assert.equal(report.profile_config_path, null);
  assert.doesNotMatch(project, /^profile\s*=/m);
  assert.doesNotMatch(project, /^\[profiles\.sks-mad-high\]/m);
  assert.doesNotMatch(project, /on-failure/);
  assert.match(project, /approval_policy = "on-request"/);
  assert.match(user, /^profile\s*=\s*"sks-mad-high"/m);
  assert.match(user, /^\[profiles\.sks-mad-high\]/m);
  assert.match(user, /^model_reasoning_effort\s*=\s*"high"/m);
  assert.match(user, /^\[model_providers\.codex-lb\]/m);
});

test('MAD launch preflight records fast service tier CLI proof', async () => {
  const mod = await import('../../dist/core/preflight/parallel-preflight-engine.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-launch-preflight-'));
  const codexHome = path.join(root, 'home', '.codex');
  await fs.mkdir(path.join(root, '.codex'), { recursive: true });
  await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
  await fs.writeFile(path.join(root, '.codex', 'config.toml'), 'model = "gpt-5.5"\nservice_tier = "fast"\n');

  const report = await mod.runCodexLaunchPreflight(root, { codexHome, profile: 'sks-mad-high', sandbox: 'danger-full-access', serviceTier: 'fast', fix: false, actualCodex: false, tmuxSmoke: false });
  assert.equal(report.ok, true);
  assert.equal(report.fast_tier_proof.ok, true);
  assert.ok(report.fast_tier_proof.codex_args.includes('-c'));
  assert.ok(report.fast_tier_proof.codex_args.includes('service_tier=fast'));
});

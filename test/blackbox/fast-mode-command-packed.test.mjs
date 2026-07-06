import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_CODEX_MODEL } from '../../dist/core/codex-model-guard.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distCli = path.join(repoRoot, 'dist', 'bin', 'sks.js');

function isolatedEnv(home) {
  return { ...process.env, HOME: home, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' };
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

test('sks fast-mode toggles project-local preference from an unpacked cwd', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-cli-'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-home-'));
  const stateFile = path.join(cwd, '.sneakoscope', 'state', 'fast-mode.json');
  const run = (...args) => {
    const result = spawnSync(process.execPath, [distCli, 'fast-mode', ...args, '--json'], {
      cwd,
      encoding: 'utf8',
      env: isolatedEnv(home)
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };

  const initial = run('status');
  assert.equal(initial.fast_mode, false);
  assert.equal(initial.service_tier, 'standard');
  assert.equal(initial.preference, null);
  assert.equal(await fileExists(stateFile), false);

  const off = run('off');
  assert.equal(off.fast_mode, false);
  assert.equal(off.service_tier, 'standard');
  assert.equal(off.preference.mode, 'standard');

  const agent = spawnSync(process.execPath, [
    distCli,
    'agent',
    'run',
    'fast mode preference fixture',
    '--mock',
    '--agents',
    '1',
    '--concurrency',
    '1',
    '--work-items',
    '1',
    '--minimum-work-items',
    '1',
    '--json'
  ], {
    cwd,
    encoding: 'utf8',
    env: isolatedEnv(home)
  });
  assert.equal(agent.status, 0, agent.stderr || agent.stdout);
  const agentRun = JSON.parse(agent.stdout);
  assert.equal(agentRun.fast_mode_policy.fast_mode, false);
  assert.equal(agentRun.fast_mode_policy.service_tier, 'standard');
  assert.equal(agentRun.fast_mode_policy.disabled_by, 'preference-standard');

  const dollarOn = spawnSync(process.execPath, [distCli, 'run', '$Fast-On', '--execute', '--json'], {
    cwd,
    encoding: 'utf8',
    env: isolatedEnv(home)
  });
  assert.equal(dollarOn.status, 0, dollarOn.stderr || dollarOn.stdout);
  const afterDollarOn = run('status');
  assert.equal(afterDollarOn.fast_mode, true);
  assert.equal(afterDollarOn.preference.mode, 'fast');

  const dollarOff = spawnSync(process.execPath, [distCli, 'run', '$Fast-Off', '--execute', '--json'], {
    cwd,
    encoding: 'utf8',
    env: isolatedEnv(home)
  });
  assert.equal(dollarOff.status, 0, dollarOff.stderr || dollarOff.stdout);
  const afterDollarOff = run('status');
  assert.equal(afterDollarOff.fast_mode, false);
  assert.equal(afterDollarOff.preference.mode, 'standard');

  const on = run('on');
  assert.equal(on.fast_mode, true);
  assert.equal(on.service_tier, 'fast');
  assert.equal(on.preference.mode, 'fast');

  const defaultAlias = run('default');
  assert.equal(defaultAlias.fast_mode, false);
  assert.equal(defaultAlias.service_tier, 'standard');
  assert.equal(defaultAlias.preference.mode, 'standard');

  const priorityAlias = run('priority');
  assert.equal(priorityAlias.fast_mode, true);
  assert.equal(priorityAlias.service_tier, 'fast');
  assert.equal(priorityAlias.preference.mode, 'fast');

  const cleared = run('clear');
  assert.equal(cleared.fast_mode, false);
  assert.equal(cleared.preference, null);
});

test('sks fast-mode on repairs Codex fast-mode UI when explicitly disabled', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-cli-'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-home-'));
  const codexDir = path.join(home, '.codex');
  const configPath = path.join(codexDir, 'config.toml');
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(configPath, [
    `model = "${REQUIRED_CODEX_MODEL}"`,
    'service_tier = "standard"',
    '',
    '[user.fast_mode]',
    'visible = false',
    'enabled = false',
    'default_profile = "custom-slow"'
  ].join('\n') + '\n');

  const result = spawnSync(process.execPath, [distCli, 'fast-mode', 'on', '--json'], {
    cwd,
    encoding: 'utf8',
    env: isolatedEnv(home)
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.fast_mode, true);
  assert.equal(parsed.codex_fast_mode_repair.status, 'updated');
  const config = await fs.readFile(configPath, 'utf8');
  assert.match(config, /^service_tier = "fast"/m);
  assert.match(config, /^default_profile = "sks-fast-high"/m);
  assert.match(config, /\[user\.fast_mode\][\s\S]*visible = true/);
  assert.match(config, /\[user\.fast_mode\][\s\S]*enabled = true/);
  assert.doesNotMatch(config, /\[user\.fast_mode\][\s\S]*default_profile = /);
  assert.match(config, /\[profiles\.sks-fast-high\][\s\S]*service_tier = "fast"/);
});

test('sks fast-mode off repairs Codex Desktop config without hiding the UI', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-cli-'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-home-'));
  const codexDir = path.join(home, '.codex');
  const configPath = path.join(codexDir, 'config.toml');
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(configPath, [
    `model = "${REQUIRED_CODEX_MODEL}"`,
    'service_tier = "fast"',
    '',
    '[user.fast_mode]',
    'visible = false',
    'enabled = false',
    'default_profile = "sks-fast-high"',
    '',
    '[profiles.sks-fast-high]',
    `model = "${REQUIRED_CODEX_MODEL}"`,
    'service_tier = "fast"'
  ].join('\n') + '\n');

  const result = spawnSync(process.execPath, [distCli, 'fast-mode', 'off', '--json'], {
    cwd,
    encoding: 'utf8',
    env: isolatedEnv(home)
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.fast_mode, false);
  assert.equal(parsed.service_tier, 'standard');
  assert.equal(parsed.codex_fast_mode_repair.status, 'updated');
  const config = await fs.readFile(configPath, 'utf8');
  assert.match(config, /^service_tier = "default"/m);
  assert.match(config, /\[user\.fast_mode\][\s\S]*visible = true/);
  assert.match(config, /\[user\.fast_mode\][\s\S]*enabled = true/);
  assert.doesNotMatch(config, /\[user\.fast_mode\][\s\S]*default_profile = /);
  assert.match(config, /\[profiles\.sks-fast-high\][\s\S]*service_tier = "fast"/);
});

test('$Fast-Mode status questions do not toggle project preference', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-question-'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-home-'));
  const stateFile = path.join(cwd, '.sneakoscope', 'state', 'fast-mode.json');
  const runPrompt = (prompt) => {
    const result = spawnSync(process.execPath, [distCli, 'run', prompt, '--execute', '--json'], {
      cwd,
      encoding: 'utf8',
      env: isolatedEnv(home)
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };

  const offQuestion = runPrompt('$Fast-Mode is it off?');
  assert.equal(offQuestion.execution.command, 'sks fast-mode status --json');
  assert.equal(offQuestion.execution.execution_kind, 'safe_deterministic');
  assert.equal(await fileExists(stateFile), false);

  const onQuestion = runPrompt('$Fast-Mode is it on?');
  assert.equal(onQuestion.execution.command, 'sks fast-mode status --json');
  assert.equal(onQuestion.execution.execution_kind, 'safe_deterministic');
  assert.equal(await fileExists(stateFile), false);

  const explicitOff = runPrompt('$Fast-Mode off');
  assert.equal(explicitOff.execution.command, 'sks fast-mode off --json');
  assert.equal(JSON.parse(await fs.readFile(stateFile, 'utf8')).mode, 'standard');

  const defaultTier = runPrompt('$Fast-Mode default');
  assert.equal(defaultTier.execution.command, 'sks fast-mode off --json');

  const priorityTier = runPrompt('$Fast-Mode priority');
  assert.equal(priorityTier.execution.command, 'sks fast-mode on --json');
});

test('dollar command list includes fast mode on/off aliases', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-home-'));
  const result = spawnSync(process.execPath, [distCli, 'dollar-commands', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: isolatedEnv(home)
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const commands = new Set(parsed.dollar_commands.map((entry) => entry.command));
  assert.ok(commands.has('$Fast-Mode'));
  assert.ok(commands.has('$Fast-On'));
  assert.ok(commands.has('$Fast-Off'));
});

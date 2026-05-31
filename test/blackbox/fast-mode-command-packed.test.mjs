import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distCli = path.join(repoRoot, 'dist', 'bin', 'sks.js');

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
  const stateFile = path.join(cwd, '.sneakoscope', 'state', 'fast-mode.json');
  const run = (...args) => {
    const result = spawnSync(process.execPath, [distCli, 'fast-mode', ...args, '--json'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };

  const initial = run('status');
  assert.equal(initial.fast_mode, true);
  assert.equal(initial.service_tier, 'fast');
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
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(agent.status, 0, agent.stderr || agent.stdout);
  const agentRun = JSON.parse(agent.stdout);
  assert.equal(agentRun.fast_mode_policy.fast_mode, false);
  assert.equal(agentRun.fast_mode_policy.service_tier, 'standard');
  assert.equal(agentRun.fast_mode_policy.disabled_by, 'preference-standard');

  const dollarOn = spawnSync(process.execPath, [distCli, 'run', '$Fast-On', '--execute', '--json'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(dollarOn.status, 0, dollarOn.stderr || dollarOn.stdout);
  const afterDollarOn = run('status');
  assert.equal(afterDollarOn.fast_mode, true);
  assert.equal(afterDollarOn.preference.mode, 'fast');

  const dollarOff = spawnSync(process.execPath, [distCli, 'run', '$Fast-Off', '--execute', '--json'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(dollarOff.status, 0, dollarOff.stderr || dollarOff.stdout);
  const afterDollarOff = run('status');
  assert.equal(afterDollarOff.fast_mode, false);
  assert.equal(afterDollarOff.preference.mode, 'standard');

  const on = run('on');
  assert.equal(on.fast_mode, true);
  assert.equal(on.service_tier, 'fast');
  assert.equal(on.preference.mode, 'fast');

  const cleared = run('clear');
  assert.equal(cleared.fast_mode, true);
  assert.equal(cleared.preference, null);
});

test('$Fast-Mode status questions do not toggle project preference', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-mode-question-'));
  const stateFile = path.join(cwd, '.sneakoscope', 'state', 'fast-mode.json');
  const runPrompt = (prompt) => {
    const result = spawnSync(process.execPath, [distCli, 'run', prompt, '--execute', '--json'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
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
});

test('dollar command list includes fast mode on/off aliases', () => {
  const result = spawnSync(process.execPath, [distCli, 'dollar-commands', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const commands = new Set(parsed.dollar_commands.map((entry) => entry.command));
  assert.ok(commands.has('$Fast-Mode'));
  assert.ok(commands.has('$Fast-On'));
  assert.ok(commands.has('$Fast-Off'));
});

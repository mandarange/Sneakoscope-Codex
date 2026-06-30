#!/usr/bin/env node
// @ts-nocheck
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess, exists, readText } from '../core/fsx.js';

const entry = './dist/bin/sks.js';
const results = [];

async function runSetup(name, args, input = 'sk-clb-test\n') {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), `sks-lb-truth-${name}-`));
  const result = await runProcess(process.execPath, [entry, 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--json', ...args], {
    input,
    env: { ...process.env, HOME: home, CI: 'true', SKS_CODEX_LB_CHAIN_CHECK: '0', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  let json = {};
  try { json = JSON.parse(result.stdout); } catch {}
  return {
    home,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    json,
    configPath: path.join(home, '.codex', 'config.toml'),
    envPath: path.join(home, '.codex', 'sks-codex-lb.env')
  };
}

{
  const row = await runSetup('plan', ['--plan']);
  results.push({
    name: 'plan_writes_nothing',
    ok: row.code === 0 && row.json.writes === false && !(await exists(row.configPath)) && !(await exists(row.envPath))
  });
}

{
  const row = await runSetup('no-default', ['--no-default-provider']);
  const config = await readText(row.configPath, '');
  results.push({
    name: 'no_default_provider',
    ok: row.code === 0 && row.json.ok === true && config.includes('[model_providers.codex-lb]') && !/^\s*model_provider\s*=\s*"codex-lb"/m.test(config)
  });
}

{
  const row = await runSetup('no-env', ['--no-env-file']);
  const actions = row.json.applied_actions?.map((action) => action.type) || [];
  results.push({
    name: 'no_env_file',
    ok: row.code === 0
      && row.json.status === 'process_env'
      && row.json.persistence?.applied_modes?.includes('process_only_ephemeral')
      && !actions.includes('write_env_file')
      && !(await exists(row.envPath))
  });
}

{
  const row = await runSetup('shell-skip', ['--shell-profile', 'skip']);
  const touched = ['.zshrc', '.bashrc', '.config/fish/config.fish'];
  results.push({
    name: 'shell_profile_skip',
    ok: row.code === 0 && touched.every((file) => !row.json.applied_actions?.some((action) => action.type === 'install_shell_profile_snippet') && !row.stdout.includes(file))
  });
}

{
  const row = await runSetup('report', ['--no-keychain', '--no-launchctl']);
  const actions = row.json.applied_actions?.map((action) => action.type) || [];
  results.push({
    name: 'action_report_matches_choices',
    ok: row.code === 0
      && actions.includes('write_config_provider')
      && actions.includes('write_env_file')
      && !actions.includes('store_keychain')
      && !actions.includes('sync_launchctl')
      && row.json.drift?.length === 0
  });
}

const text = results.map((row) => `${row.name}:${row.ok}`).join('\n');
const ok = results.every((row) => row.ok) && !/sk-clb-test/.test(text);
console.log(JSON.stringify({
  schema: 'sks.codex-lb-setup-truthfulness-check.v1',
  ok,
  results
}, null, 2));
if (!ok) process.exitCode = 1;

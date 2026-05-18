#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-command-import-smoke-'));
const cache = path.join(tmp, 'npm-cache');
const consumer = path.join(tmp, 'consumer');
const failures = [];
const rows = [];
fs.mkdirSync(consumer, { recursive: true });
fs.writeFileSync(path.join(consumer, 'package.json'), `${JSON.stringify({ name: 'sks-command-smoke-consumer', private: true }, null, 2)}\n`);

try {
  run('build', npmBin, ['run', 'build'], { cwd: root });
  const pack = run('npm_pack', npmBin, ['pack', '--json', '--ignore-scripts', '--pack-destination', tmp, '--registry', 'https://registry.npmjs.org/'], { cwd: root });
  const info = pack.ok ? JSON.parse(pack.stdout || '[]')[0] : null;
  const tarball = info ? path.join(tmp, info.filename) : null;
  if (tarball) run('npm_install_tarball', npmBin, ['install', '--no-audit', '--no-fund', tarball], { cwd: consumer });
  const pkgRoot = path.join(consumer, 'node_modules', 'sneakoscope');
  if (!fs.existsSync(pkgRoot)) failures.push('installed_package_missing');
  else await smokeCommands(pkgRoot);
} finally {
  if (failures.length && process.argv.includes('--keep')) {
    // Keep temp root for debugging only when explicitly requested.
  } else if (!process.argv.includes('--keep')) {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const result = {
  schema: 'sks.blackbox-command-import-smoke.v1',
  ok: failures.length === 0,
  temp_root: failures.length && process.argv.includes('--keep') ? tmp : null,
  rows,
  failures
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function run(label, cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    timeout: options.timeout || 120_000,
    env: childNpmEnv(options.env)
  });
  const row = {
    label,
    command: [cmd, ...args].join(' '),
    status: result.status,
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr_tail: String(result.stderr || '').slice(-800)
  };
  rows.push({ ...row, stdout: undefined });
  if (!row.ok) failures.push(`${label}:${row.stderr_tail || result.stdout}`);
  return row;
}

function childNpmEnv(extra = {}) {
  const env = { ...process.env, npm_config_cache: cache, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true', ...extra };
  delete env.npm_config_dry_run;
  delete env.NPM_CONFIG_DRY_RUN;
  return env;
}

async function smokeCommands(pkgRoot) {
  const registryPath = path.join(pkgRoot, 'dist', 'cli', 'command-registry.mjs');
  if (!fs.existsSync(registryPath)) {
    failures.push('dist_cli_command_registry_missing');
    return;
  }
  const registry = await import(pathToFileURL(registryPath));
  const names = registry.commandNames();
  for (const name of names) {
    const entry = registry.COMMANDS[name];
    try {
      const mod = await entry.lazy();
      const runner = mod.run || mod.main || mod.default;
      if (typeof runner !== 'function') failures.push(`${name}:runner_missing`);
      rows.push({ label: `lazy_import:${name}`, ok: typeof runner === 'function', status: typeof runner === 'function' ? 0 : 1 });
    } catch (err) {
      failures.push(`${name}:${err.stack || err.message}`);
      rows.push({ label: `lazy_import:${name}`, ok: false, status: 1, stderr_tail: String(err.stack || err.message).slice(-800) });
    }
  }
}

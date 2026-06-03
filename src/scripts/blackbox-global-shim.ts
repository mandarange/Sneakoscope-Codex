#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = process.argv.includes('--json');
const dryRun = process.argv.includes('--dry-run');
const keep = process.argv.includes('--keep');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-blackbox-global-'));
const prefix = path.join(tmp, 'prefix');
const cache = path.join(tmp, 'npm-cache');
const binDir = process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
const shim = path.join(binDir, process.platform === 'win32' ? 'sks.cmd' : 'sks');
const sneakoscopeShim = path.join(binDir, process.platform === 'win32' ? 'sneakoscope.cmd' : 'sneakoscope');
const steps = [];

function run(label, cmd, args, options = {}) {
  const result = dryRun
    ? { status: 0, signal: null, stdout: '', stderr: '' }
    : spawnSync(cmd, args, {
        cwd: options.cwd || root,
        encoding: 'utf8',
        timeout: options.timeout || 120_000,
        env: childNpmEnv(options.env)
      });
  const row = {
    label,
    command: [cmd, ...args].join(' '),
    cwd: options.cwd || root,
    status: result.status,
    ok: result.status === 0,
    stdout_bytes: Buffer.byteLength(result.stdout || ''),
    stderr_bytes: Buffer.byteLength(result.stderr || ''),
    stderr_tail: String(result.stderr || '').slice(-800)
  };
  steps.push(row);
  return { ...row, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function childNpmEnv(extra = {}) {
  const env = { ...process.env, npm_config_cache: cache, npm_config_prefix: prefix, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true', ...extra };
  delete env.npm_config_dry_run;
  delete env.NPM_CONFIG_DRY_RUN;
  return env;
}

let tarball = dryRun ? path.join(tmp, 'sneakoscope-0.0.0.tgz') : null;
const pack = run('npm_pack', npmBin, ['pack', '--json', '--ignore-scripts', '--pack-destination', tmp, '--registry', 'https://registry.npmjs.org/']);
if (pack.ok && !dryRun) {
  const info = JSON.parse(pack.stdout)[0];
  tarball = path.join(tmp, info.filename);
}
if (pack.ok) run('npm_install_global_prefix', npmBin, ['install', '--global', '--prefix', prefix, '--no-audit', '--no-fund', tarball]);
if (steps.at(-1)?.ok) run('global_shim_version', shim, ['--version'], { cwd: tmp, env: pathEnv() });
if (steps.at(-1)?.ok) run('global_sneakoscope_version', sneakoscopeShim, ['--version'], { cwd: tmp, env: pathEnv() });
if (steps.at(-1)?.ok) run('global_sks_root_json', shim, ['root', '--json'], { cwd: tmp, env: pathEnv() });
if (!keep) fs.rmSync(tmp, { recursive: true, force: true });

const result = { schema: 'sks.blackbox-global-shim.v1', ok: steps.every((step) => step.ok), dry_run: dryRun, temp_root: keep ? tmp : null, steps };
if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Blackbox global shim: ${result.ok ? 'ok' : 'blocked'}${dryRun ? ' (dry-run)' : ''}`);
  for (const step of steps) console.log(`- ${step.ok ? 'ok' : 'blocked'} ${step.label}`);
}
if (!result.ok) process.exitCode = 1;

function pathEnv() {
  return { PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}` };
}

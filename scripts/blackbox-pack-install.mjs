#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = process.argv.includes('--json');
const dryRun = process.argv.includes('--dry-run');
const keep = process.argv.includes('--keep');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-blackbox-pack-install-'));
const cache = path.join(tmp, 'npm-cache');
const prefix = path.join(tmp, 'prefix');
const consumer = path.join(tmp, 'consumer');
fs.mkdirSync(consumer, { recursive: true });
fs.writeFileSync(path.join(consumer, 'package.json'), `${JSON.stringify({ name: 'sks-blackbox-consumer', private: true, version: '0.0.0' }, null, 2)}\n`);

const steps = [];

function spawnStep(label, cmd, args, options = {}) {
  const result = dryRun
    ? { status: 0, signal: null, stdout: '', stderr: '' }
    : spawnSync(cmd, args, {
        cwd: options.cwd || root,
        encoding: 'utf8',
        timeout: options.timeout || 120_000,
        env: childNpmEnv(options.env)
      });
  return {
    label,
    command: [cmd, ...args].join(' '),
    cwd: options.cwd || root,
    status: result.status,
    ok: result.status === 0,
    stdout_bytes: Buffer.byteLength(result.stdout || ''),
    stderr_bytes: Buffer.byteLength(result.stderr || ''),
    stdout_tail: String(result.stdout || '').slice(-800),
    stderr_tail: String(result.stderr || '').slice(-800),
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function childNpmEnv(extra = {}) {
  const env = { ...process.env, npm_config_cache: cache, npm_config_prefix: prefix, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true', ...extra };
  delete env.npm_config_dry_run;
  delete env.NPM_CONFIG_DRY_RUN;
  return env;
}

function run(label, cmd, args, options = {}) {
  const row = spawnStep(label, cmd, args, options);
  steps.push(recordStep(row));
  return row;
}

function runWithRetry(label, cmd, args, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 2));
  const attemptRows = [];
  for (let index = 0; index < attempts; index += 1) {
    if (index > 0) cleanupInstallAttempt(options.cwd || root);
    const row = spawnStep(label, cmd, args, options);
    attemptRows.push(row);
    if (row.ok || dryRun) {
      const final = { ...row, label, attempts: index + 1, retry_count: index, attempts_log: attemptRows.map(compactAttempt) };
      steps.push(recordStep(final));
      return final;
    }
  }
  const last = attemptRows.at(-1);
  const final = { ...last, label, attempts, retry_count: attempts - 1, attempts_log: attemptRows.map(compactAttempt) };
  steps.push(recordStep(final));
  return final;
}

function recordStep(row) {
  const { stdout, stderr, ...recorded } = row;
  return recorded;
}

function compactAttempt(row) {
  return {
    status: row.status,
    ok: row.ok,
    stdout_bytes: row.stdout_bytes,
    stderr_bytes: row.stderr_bytes,
    stdout_tail: row.stdout_tail,
    stderr_tail: row.stderr_tail
  };
}

function cleanupInstallAttempt(cwd) {
  if (dryRun) return;
  for (const rel of ['node_modules', 'package-lock.json']) {
    fs.rmSync(path.join(cwd, rel), { recursive: true, force: true });
  }
}

let tarball = dryRun ? path.join(tmp, 'sneakoscope-0.0.0.tgz') : null;
const pack = run('npm_pack', npmBin, ['pack', '--json', '--ignore-scripts', '--pack-destination', tmp, '--registry', 'https://registry.npmjs.org/']);
if (pack.ok && !dryRun) {
  const info = JSON.parse(pack.stdout || '[]')[0];
  tarball = path.join(tmp, info.filename);
}
if (pack.ok) runWithRetry('npm_install_tarball', npmBin, ['install', '--no-audit', '--no-fund', tarball], { cwd: consumer, attempts: 2 });
if (steps.at(-1)?.ok) run('npx_sks_version', npxBin, ['sks', '--version'], { cwd: consumer });
if (steps.at(-1)?.ok) run('npx_sks_root_json', npxBin, ['sks', 'root', '--json'], { cwd: consumer });
if (steps.at(-1)?.ok) run('npx_sks_setup_local_only', npxBin, ['sks', 'setup', '--local-only', '--json'], { cwd: consumer });
if (steps.at(-1)?.ok) run('npx_sks_selftest_mock', npxBin, ['sks', 'selftest', '--mock'], { cwd: consumer, timeout: 180_000 });
if (steps.at(-1)?.ok) run('npx_sks_run_execute_mock', npxBin, ['sks', 'run', 'blackbox execute fixture', '--execute', '--mock', '--json'], { cwd: consumer, timeout: 180_000 });
if (steps.at(-1)?.ok) run('npx_sks_agent_mock', npxBin, ['sks', 'agent', 'run', 'blackbox native agent fixture', '--mock', '--json'], { cwd: consumer, timeout: 180_000 });
let qaMissionId = null;
if (steps.at(-1)?.ok) {
  const qaPrepare = run('npx_sks_qa_loop_prepare', npxBin, ['sks', 'qa-loop', 'prepare', 'blackbox UI QA', '--json'], { cwd: consumer, timeout: 180_000 });
  try { qaMissionId = JSON.parse(qaPrepare.stdout).mission_id || null; } catch {}
}
if (steps.at(-1)?.ok) run('npx_sks_qa_loop_run_mock', npxBin, ['sks', 'qa-loop', 'run', qaMissionId || 'latest', '--mock', '--json'], { cwd: consumer, timeout: 180_000 });
if (steps.at(-1)?.ok) {
  const proofFile = dryRun ? '<dry-run>' : latestCompletionProof(consumer);
  steps.push({
    label: 'verify_completion_proof_exists',
    command: 'fs.existsSync(.sneakoscope/missions/<latest>/completion-proof.json)',
    cwd: consumer,
    status: proofFile ? 0 : 1,
    ok: Boolean(proofFile),
    stdout_bytes: 0,
    stderr_bytes: 0,
    stderr_tail: proofFile || 'completion-proof.json missing'
  });
}
const result = { schema: 'sks.blackbox-pack-install.v1', ok: steps.every((step) => step.ok), dry_run: dryRun, temp_root: keep ? tmp : null, steps };
if (!result.ok) result.temp_root = tmp;
if (!keep && result.ok) fs.rmSync(tmp, { recursive: true, force: true });
if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Blackbox pack install: ${result.ok ? 'ok' : 'blocked'}${dryRun ? ' (dry-run)' : ''}`);
  for (const step of steps) {
    console.log(`- ${step.ok ? 'ok' : 'blocked'} ${step.label}${step.attempts ? ` attempts=${step.attempts}` : ''}`);
    if (!step.ok && step.stderr_tail) console.log(`  stderr_tail: ${step.stderr_tail.replace(/\n/g, '\\n')}`);
    if (!step.ok && step.stdout_tail) console.log(`  stdout_tail: ${step.stdout_tail.replace(/\n/g, '\\n')}`);
  }
  if (!result.ok) console.log(`temp_root: ${tmp}`);
}
if (!result.ok) process.exitCode = 1;

function latestCompletionProof(rootDir) {
  const missions = path.join(rootDir, '.sneakoscope', 'missions');
  if (!fs.existsSync(missions)) return null;
  const ids = fs.readdirSync(missions, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('M-'))
    .map((entry) => entry.name)
    .sort();
  for (const id of ids.reverse()) {
    const proof = path.join(missions, id, 'completion-proof.json');
    if (fs.existsSync(proof)) return proof;
  }
  return null;
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const skipReleaseCheck = args.includes('--skip-release-check') || process.env.SKS_RELEASE_REAL_CHECK_SKIP_RELEASE_CHECK === '1';
const root = process.cwd();

const report = {
  schema: 'sks.release-real-check.v1',
  generated_at: new Date().toISOString(),
  ok: false,
  release_check: null,
  environment_required_checks: [],
  real_smoke_checks: [],
  blockers: [],
  warnings: []
};

if (!skipReleaseCheck) {
  report.release_check = runNpm('release:check');
  collect(report.release_check);
  if (!report.release_check.ok) finish(false);
} else {
  report.release_check = {
    id: 'release:check',
    ok: true,
    skipped: true,
    note: 'Skipped because caller already verified release:check in this workspace.'
  };
}

for (const [script, extraArgs] of [
  ['codex:actual-config-load-probe', []],
  ['codex:0.136-compat:require-real', []],
  ['codex:0.135-compat:require-real', []],
  ['doctor:codex-doctor-parity:actual', []],
  ['publish:dry-run-performance', []],
  ['zellij:capability', ['--require-real']],
  ['zellij:layout-valid', ['--require-real']],
  ['zellij:real-session-launch', ['--require-real', '--mission', 'M-release-real-zellij', '--session', 'sks-rrz']],
  ['zellij:pane-proof', ['--require-real', '--mission', 'M-release-real-zellij', '--session', 'sks-rrz', '--expected-lanes', '1']],
  ['zellij:screen-proof', ['--require-real', '--mission', 'M-release-real-zellij']],
  ['zellij:real-session-cleanup', ['--mission', 'M-release-real-zellij', '--session', 'sks-rrz']]
]) {
  const result = runNpm(script, extraArgs);
  report.environment_required_checks.push(result);
  collect(result);
}

if (report.environment_required_checks.some((row) => !row.ok)) finish(false);

for (const [script, extraArgs] of [
  ['codex:0.134-runner-truth', []],
  ['agent:real-codex-patch-envelope-smoke', []],
  ['agent:real-codex-parallel-workers', []],
  ['agent:real-codex-parallel-workers-5', []],
  ['agent:real-codex-parallel-workers-10', []],
  ['agent:real-codex-parallel-workers-20', []],
  ['agent:real-codex-dynamic-smoke-v2', []],
  ['agent:real-codex-dynamic-smoke', []],
  ['imagegen:real-smoke', []],
  ['ux-review:real-imagegen-smoke', []],
  ['ppt:real-imagegen-smoke', []]
]) {
  const result = runNpm(script, extraArgs);
  report.real_smoke_checks.push(result);
  collect(result);
}

finish(report.real_smoke_checks.every((row) => row.ok));

function runNpm(script, extraArgs = []) {
  const npmArgs = ['run', script, '--silent'];
  if (extraArgs.length) npmArgs.push('--', ...extraArgs);
  const result = spawnSync('npm', npmArgs, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  const parsed = parseJson(result.stdout);
  return {
    id: script,
    command: ['npm', ...npmArgs],
    ok: result.status === 0,
    exit_code: result.status,
    signal: result.signal,
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
    parsed_schema: parsed?.schema || null,
    parsed_ok: typeof parsed?.ok === 'boolean' ? parsed.ok : null,
    blockers: extractList(parsed, 'blockers'),
    warnings: extractList(parsed, 'warnings'),
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr)
  };
}

function collect(result) {
  for (const blocker of result.blockers || []) {
    if (!report.blockers.includes(blocker)) report.blockers.push(blocker);
  }
  if (!result.ok && !(result.blockers || []).length) {
    const blocker = `${result.id.replace(/[^A-Za-z0-9]+/g, '_')}_failed`;
    if (!report.blockers.includes(blocker)) report.blockers.push(blocker);
  }
  for (const warning of result.warnings || []) {
    if (!report.warnings.includes(warning)) report.warnings.push(warning);
  }
}

function finish(ok) {
  report.ok = ok && report.blockers.length === 0;
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  process.exit();
}

function parseJson(text) {
  const value = String(text || '').trim();
  if (!value.startsWith('{')) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractList(parsed, key) {
  if (!parsed || typeof parsed !== 'object') return [];
  const values = [];
  const top = parsed[key];
  const nested = parsed.report && typeof parsed.report === 'object' ? parsed.report[key] : null;
  for (const list of [top, nested]) {
    if (Array.isArray(list)) values.push(...list);
  }
  return [...new Set(values)];
}

function tail(value, limit = 4000) {
  const text = String(value || '');
  return text.length <= limit ? text : text.slice(-limit);
}

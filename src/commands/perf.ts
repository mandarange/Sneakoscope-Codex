// @ts-nocheck
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { PACKAGE_VERSION, projectRoot } from '../core/fsx.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';

export const DEFAULT_COLD_START_ITERATIONS = 20;

const COLD_START_TIERS = Object.freeze({
  'source-local': {
    'sks --version': 80,
    'sks help': 150,
    'sks root --json': 150,
    'sks features check --json': 1500
  },
  'source-ci': {
    'sks --version': 120,
    'sks help': 220,
    'sks root --json': 220,
    'sks features check --json': 2200
  },
  'packed-local': {
    'sks --version': 160,
    'sks help': 280,
    'sks root --json': 280,
    'sks features check --json': 2800
  },
  'global-shim': {
    'sks --version': 220,
    'sks help': 350,
    'sks root --json': 350,
    'sks features check --json': 3200
  },
  'npx-one-shot': {
    'sks --version': 3000,
    'sks help': 3000,
    'sks root --json': 3000,
    'sks features check --json': 5000
  }
});

const COLD_START_COMMANDS = Object.freeze([
  { cmd: 'sks --version', args: ['--version'] },
  { cmd: 'sks help', args: ['help'] },
  { cmd: 'sks root --json', args: ['root', '--json'] },
  { cmd: 'sks features check --json', args: ['features', 'check', '--json'] }
]);

export async function run(_command, args = []) {
  const action = args[0] || 'run';
  if (action === 'cold-start') {
    const root = await projectRoot();
    const iterations = resolveColdStartIterations(readArg(args, '--iterations', process.env.SKS_COLD_START_ITERATIONS));
    const result = runColdStart({ root, iterations, tier: readArg(args, '--tier', process.env.SKS_PERF_TIER || 'source-local') });
    if (flag(args, '--json')) return printJson(result);
    console.log(`Cold-start: ${result.ok ? 'pass' : 'fail'}`);
    for (const row of result.commands) console.log(`- ${row.cmd}: p95=${row.p95_ms}ms budget=${row.budget_p95_ms}ms ${row.ok ? 'ok' : 'blocked'}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const { perfCommand } = await import('../core/commands/perf-command.js');
  return perfCommand(action, args.slice(1));
}

export function runColdStart({ root = process.cwd(), iterations = DEFAULT_COLD_START_ITERATIONS, tier = 'source-local' } = {}) {
  const script = new URL('../bin/sks.js', import.meta.url).pathname;
  const measuredIterations = resolveColdStartIterations(iterations);
  const budgets = COLD_START_TIERS[tier] || COLD_START_TIERS['source-local'];
  const commands = COLD_START_COMMANDS.map((spec) => measureCommand(root, script, { ...spec, budget_p95_ms: budgets[spec.cmd] }, measuredIterations));
  return {
    schema: 'sks.perf.cold-start.v1',
    version: PACKAGE_VERSION,
    tier,
    budget_tiers: COLD_START_TIERS,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    commands,
    ok: commands.every((row) => row.ok)
  };
}

export function resolveColdStartIterations(value = DEFAULT_COLD_START_ITERATIONS) {
  const parsed = Number(value ?? DEFAULT_COLD_START_ITERATIONS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_COLD_START_ITERATIONS;
  return Math.max(1, Math.floor(parsed));
}

function measureCommand(root, script, spec, iterations) {
  const values = [];
  const failures = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    const res = spawnSync(process.execPath, [script, ...spec.args], {
      cwd: root,
      env: { ...process.env, SKS_SKIP_UPDATE_CHECK: '1', CI: 'true' },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      shell: false
    });
    values.push(performance.now() - t0);
    if (res.status !== 0) failures.push({ status: res.status, stderr: String(res.stderr || '').slice(0, 400) });
  }
  values.sort((a, b) => a - b);
  const p50 = percentile(values, 50);
  const p95 = percentile(values, 95);
  const p95Rounded = Math.round(p95);
  return {
    cmd: spec.cmd,
    iterations,
    p50_ms: Math.round(p50),
    p95_ms: p95Rounded,
    budget_p95_ms: spec.budget_p95_ms,
    ok: failures.length === 0 && p95Rounded <= spec.budget_p95_ms,
    failures
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const idx = Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1);
  return values[idx];
}

function readArg(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

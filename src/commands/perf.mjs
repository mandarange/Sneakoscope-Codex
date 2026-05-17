import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { PACKAGE_VERSION, projectRoot } from '../core/fsx.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';

export const DEFAULT_COLD_START_ITERATIONS = 20;

const COLD_START_COMMANDS = Object.freeze([
  { cmd: 'sks --version', args: ['--version'], budget_p95_ms: 80 },
  { cmd: 'sks help', args: ['help'], budget_p95_ms: 150 },
  { cmd: 'sks root --json', args: ['root', '--json'], budget_p95_ms: 150 },
  { cmd: 'sks features check --json', args: ['features', 'check', '--json'], budget_p95_ms: 1500 }
]);

export async function run(_command, args = []) {
  const action = args[0] || 'run';
  if (action === 'cold-start') {
    const root = await projectRoot();
    const iterations = resolveColdStartIterations(readArg(args, '--iterations', process.env.SKS_COLD_START_ITERATIONS));
    const result = runColdStart({ root, iterations });
    if (flag(args, '--json')) return printJson(result);
    console.log(`Cold-start: ${result.ok ? 'pass' : 'fail'}`);
    for (const row of result.commands) console.log(`- ${row.cmd}: p95=${row.p95_ms}ms budget=${row.budget_p95_ms}ms ${row.ok ? 'ok' : 'blocked'}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const { perfCommand } = await import('../core/commands/route-cli.mjs');
  return perfCommand(action, args.slice(1));
}

export function runColdStart({ root = process.cwd(), iterations = DEFAULT_COLD_START_ITERATIONS } = {}) {
  const script = new URL('../../bin/sks.mjs', import.meta.url).pathname;
  const measuredIterations = resolveColdStartIterations(iterations);
  const commands = COLD_START_COMMANDS.map((spec) => measureCommand(root, script, spec, measuredIterations));
  return {
    schema: 'sks.perf.cold-start.v1',
    version: PACKAGE_VERSION,
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

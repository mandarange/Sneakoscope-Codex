import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ensureDir, nowIso, packageRoot, projectRoot, runProcess, writeJsonAtomic, writeTextAtomic } from './fsx.js';
import { percentile } from './perf-bench.js';

export const CORE_BENCH_BUDGET_TIERS = Object.freeze({
  'source-local': {
    'sks --version': 50,
    'sks help': 80,
    'sks root --json': 80,
    'sks commands --json': 120,
    'sks proof validate --json': 250,
    'sks trust validate latest --json': 300,
    'sks wiki image-validate --json': 300,
    'sks features check --json': 1200,
    'sks scouts engines --json': 1000
  },
  'source-ci': {
    'sks --version': 80,
    'sks help': 140,
    'sks root --json': 140,
    'sks commands --json': 200,
    'sks proof validate --json': 350,
    'sks trust validate latest --json': 450,
    'sks wiki image-validate --json': 450,
    'sks features check --json': 1800,
    'sks scouts engines --json': 1400
  },
  'packed-local': {
    'sks --version': 100,
    'sks help': 180,
    'sks root --json': 180,
    'sks commands --json': 260,
    'sks proof validate --json': 500,
    'sks trust validate latest --json': 650,
    'sks wiki image-validate --json': 650,
    'sks features check --json': 2400,
    'sks scouts engines --json': 1800
  },
  'global-shim': {
    'sks --version': 140,
    'sks help': 240,
    'sks root --json': 240,
    'sks commands --json': 320,
    'sks proof validate --json': 700,
    'sks trust validate latest --json': 800,
    'sks wiki image-validate --json': 800,
    'sks features check --json': 2800,
    'sks scouts engines --json': 2200
  },
  'npx-one-shot': {
    'sks --version': 3000,
    'sks help': 3000,
    'sks root --json': 3000,
    'sks commands --json': 3500,
    'sks proof validate --json': 3500,
    'sks trust validate latest --json': 3500,
    'sks wiki image-validate --json': 3500,
    'sks features check --json': 5000,
    'sks scouts engines --json': 5000
  }
});

export const CORE_BENCH_BUDGETS = CORE_BENCH_BUDGET_TIERS['source-local'];

const CORE_COMMANDS = Object.freeze([
  ['sks --version', ['--version']],
  ['sks help', ['help']],
  ['sks root --json', ['root', '--json']],
  ['sks commands --json', ['commands', '--json']],
  ['sks proof validate --json', ['proof', 'validate', '--json']],
  ['sks trust validate latest --json', ['trust', 'validate', 'latest', '--json']],
  ['sks wiki image-validate --json', ['wiki', 'image-validate', '--json']],
  ['sks features check --json', ['features', 'check', '--json']],
  ['sks scouts engines --json', ['scouts', 'engines', '--json']]
]);

export async function runCoreBench(root: any = process.cwd(), { iterations = 3, tier = 'source-local' }: any = {}) {
  const script = path.join(packageRoot(), 'dist', 'bin', 'sks.js');
  const budgets = ((CORE_BENCH_BUDGET_TIERS as Record<string, Record<string, number>>)[tier] || CORE_BENCH_BUDGET_TIERS['source-local']) as Record<string, number>;
  await ensureBenchTrustMission(root, script);
  const rows: any[] = [];
  for (const [label, args] of CORE_COMMANDS as readonly [string, string[]][]) {
    const values: any[] = [];
    const failures: any[] = [];
    for (let i = 0; i < Math.max(1, Number(iterations) || 1); i += 1) {
      const t0 = performance.now();
      const result = await runProcess(process.execPath, [script, ...args], {
        cwd: root,
        timeoutMs: 30_000,
        maxOutputBytes: 256 * 1024,
        env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', SKS_DISABLE_UPDATE_CHECK: '1', CI: 'true' }
      });
      values.push(performance.now() - t0);
      if (result.code !== 0) failures.push({ code: result.code, stderr_tail: result.stderr.slice(-400), stdout_tail: result.stdout.slice(-400) });
    }
    const p95 = Math.round(percentile(values, 95));
    rows.push({
      command: label,
      budget_p95_ms: budgets[label] ?? 0,
      p95_ms: p95,
      ok: failures.length === 0 && p95 <= (budgets[label] ?? 0),
      failures,
      raw_ms: values.map((value: any) => Math.round(value))
    });
  }
  const report = {
    schema: 'sks.core-bench.v1',
    generated_at: nowIso(),
    tier,
    iterations: Math.max(1, Number(iterations) || 1),
    budget_tiers: CORE_BENCH_BUDGET_TIERS,
    ok: rows.every((row: any) => row.ok),
    commands: rows
  };
  await writeCoreBenchArtifacts(root, report);
  return report;
}

async function ensureBenchTrustMission(root: any, script: any) {
  await runProcess(process.execPath, [script, 'run', 'bench trust fixture', '--mock', '--json'], {
    cwd: root,
    timeoutMs: 60_000,
    maxOutputBytes: 256 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', SKS_DISABLE_UPDATE_CHECK: '1', CI: 'true' }
  });
}

export async function writeCoreBenchArtifacts(root: any, report: any) {
  const dir = path.join(root, '.sneakoscope', 'reports', 'performance');
  await ensureDir(dir);
  await writeJsonAtomic(path.join(dir, 'core-bench.json'), report);
  const lines = [
    '# SKS Core Bench',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.ok ? 'pass' : 'verified_partial_or_blocked'}`,
    '',
    '| Command | Budget p95 | Result p95 | Status |',
    '| --- | ---: | ---: | --- |'
  ];
  for (const row of report.commands) lines.push(`| \`${row.command}\` | ${row.budget_p95_ms}ms | ${row.p95_ms}ms | ${row.ok ? 'pass' : 'blocked'} |`);
  await writeTextAtomic(path.join(dir, 'core-bench.md'), `${lines.join('\n')}\n`);
}

export async function benchRoot() {
  return projectRoot();
}

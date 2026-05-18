import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ensureDir, nowIso, packageRoot, projectRoot, runProcess, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';
import { percentile } from './perf-bench.mjs';

export const CORE_BENCH_BUDGETS = Object.freeze({
  'sks --version': 50,
  'sks help': 80,
  'sks root --json': 80,
  'sks commands --json': 120,
  'sks proof validate --json': 250,
  'sks trust validate latest --json': 300,
  'sks wiki image-validate --json': 300,
  'sks features check --json': 1200,
  'sks scouts engines --json': 1000
});

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

export async function runCoreBench(root = process.cwd(), { iterations = 3 } = {}) {
  const script = path.join(packageRoot(), 'bin', 'sks.mjs');
  await ensureBenchTrustMission(root, script);
  const rows = [];
  for (const [label, args] of CORE_COMMANDS) {
    const values = [];
    const failures = [];
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
      budget_p95_ms: CORE_BENCH_BUDGETS[label],
      p95_ms: p95,
      ok: failures.length === 0 && p95 <= CORE_BENCH_BUDGETS[label],
      failures,
      raw_ms: values.map((value) => Math.round(value))
    });
  }
  const report = {
    schema: 'sks.core-bench.v1',
    generated_at: nowIso(),
    iterations: Math.max(1, Number(iterations) || 1),
    ok: rows.every((row) => row.ok),
    commands: rows
  };
  await writeCoreBenchArtifacts(root, report);
  return report;
}

async function ensureBenchTrustMission(root, script) {
  await runProcess(process.execPath, [script, 'run', 'bench trust fixture', '--mock', '--json'], {
    cwd: root,
    timeoutMs: 60_000,
    maxOutputBytes: 256 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', SKS_DISABLE_UPDATE_CHECK: '1', CI: 'true' }
  });
}

export async function writeCoreBenchArtifacts(root, report) {
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

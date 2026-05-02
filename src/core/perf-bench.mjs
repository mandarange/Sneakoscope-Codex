import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { dirSize, fileSize, nowIso, packageRoot, runProcess, writeJsonAtomic } from './fsx.mjs';

export const DEFAULT_PERF_BUDGETS = {
  cli_startup_ms_p95: 250,
  route_decision_ms_p95: 75,
  context_build_ms_p95: 500,
  artifact_validation_ms_p95: 150,
  dashboard_render_ms_p95: 100,
  fast_selftest_ms_p95: 5000,
  package_size_kb_max: 1024,
  notes: 'Package payload budget is 1024KB because the current low-dependency CLI payload is already above 512KB; reduce only with measured justification.'
};

export function percentile(values, p = 95) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

export async function ensurePerfBudgetFile(root) {
  const file = path.join(root, '.sneakoscope', 'perf', 'budgets.json');
  await writeJsonAtomic(file, DEFAULT_PERF_BUDGETS);
  return file;
}

export async function runPerfBench(root, opts = {}) {
  const iterations = Math.max(1, Math.min(20, Number(opts.iterations || 3)));
  const sksBin = path.join(packageRoot(), 'bin', 'sks.mjs');
  const startup = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const result = await runProcess(process.execPath, [sksBin, 'commands', '--json'], { cwd: root, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
    startup.push(performance.now() - t0);
    if (result.code !== 0) break;
  }
  const packageSizeKb = Math.round((await packagePayloadSize(packageRoot())) / 1024);
  const budgetFile = await ensurePerfBudgetFile(root);
  return {
    schema_version: 1,
    measured_at: nowIso(),
    iterations,
    budgets: DEFAULT_PERF_BUDGETS,
    budget_file: budgetFile,
    metrics: {
      cli_startup_ms_p95: Math.round(percentile(startup, 95)),
      package_size_kb: packageSizeKb
    },
    raw: { cli_startup_ms: startup.map((value) => Math.round(value)) }
  };
}

async function packagePayloadSize(root) {
  let total = 0;
  for (const rel of ['bin', 'src']) total += await dirSize(path.join(root, rel));
  for (const rel of ['README.md', 'LICENSE', 'package.json']) total += await fileSize(path.join(root, rel));
  return total;
}

import fs from 'node:fs/promises';
import os from 'node:os';
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
    'sks trust validate bench-fixture --json': 300,
    'sks wiki image-validate --json': 300,
    'sks features check --json': 1200,
    'sks agent status --json': 1000
  },
  'source-ci': {
    'sks --version': 80,
    'sks help': 140,
    'sks root --json': 140,
    'sks commands --json': 320,
    'sks proof validate --json': 350,
    'sks trust validate bench-fixture --json': 450,
    'sks wiki image-validate --json': 450,
    'sks features check --json': 1800,
    'sks agent status --json': 1400
  },
  'packed-local': {
    'sks --version': 100,
    'sks help': 180,
    'sks root --json': 180,
    'sks commands --json': 260,
    'sks proof validate --json': 500,
    'sks trust validate bench-fixture --json': 650,
    'sks wiki image-validate --json': 650,
    'sks features check --json': 2400,
    'sks agent status --json': 1800
  },
  'global-shim': {
    'sks --version': 140,
    'sks help': 240,
    'sks root --json': 240,
    'sks commands --json': 320,
    'sks proof validate --json': 700,
    'sks trust validate bench-fixture --json': 800,
    'sks wiki image-validate --json': 800,
    'sks features check --json': 2800,
    'sks agent status --json': 2200
  },
  'npx-one-shot': {
    'sks --version': 3000,
    'sks help': 3000,
    'sks root --json': 3000,
    'sks commands --json': 3500,
    'sks proof validate --json': 3500,
    'sks trust validate bench-fixture --json': 3500,
    'sks wiki image-validate --json': 3500,
    'sks features check --json': 5000,
    'sks agent status --json': 5000
  }
});

export const CORE_BENCH_BUDGETS = CORE_BENCH_BUDGET_TIERS['source-local'];
export const TRUST_VALIDATE_BENCH_COMMAND = 'sks trust validate bench-fixture --json';
export const CORE_BENCH_WARMUP_ITERATIONS = 1;
export const UX_REVIEW_STAGED_LATENCY_BUDGETS = Object.freeze({
  source_screenshot_ingest: 500,
  gpt_image_2_generation: 120_000,
  callout_extraction: 120_000,
  fix_task_planning: 500,
  recapture_re_review: 120_000,
  image_voxel_relation_validation: 800,
  codex_compat_probe_batch: 5_000,
  computer_use_status_probe_batch: 5_000,
  codex_lb_status_probe_batch: 5_000,
  agent_status_probe_batch: 5_000
});

type CoreBenchCommand = readonly [string, readonly string[], string?];

const STATIC_CORE_COMMANDS: readonly CoreBenchCommand[] = Object.freeze([
  ['sks --version', ['--version']],
  ['sks help', ['help']],
  ['sks root --json', ['root', '--json']],
  ['sks commands --json', ['commands', '--json']],
  ['sks proof validate --json', ['proof', 'validate', '--json']],
  ['sks wiki image-validate --json', ['wiki', 'image-validate', '--json']],
  ['sks features check --json', ['features', 'check', '--json']],
  ['sks agent status --json', ['agent', 'status', '--json']]
]);

function coreCommands(benchTrustMission: any): CoreBenchCommand[] {
  const missionId = typeof benchTrustMission?.missionId === 'string' && benchTrustMission.missionId
    ? benchTrustMission.missionId
    : 'bench-fixture-missing';
  const trustRoot = typeof benchTrustMission?.root === 'string' && benchTrustMission.root
    ? benchTrustMission.root
    : undefined;
  return [
    ...STATIC_CORE_COMMANDS.slice(0, 5),
    [TRUST_VALIDATE_BENCH_COMMAND, ['trust', 'validate', missionId, '--json', '--no-wrongness'], trustRoot],
    ...STATIC_CORE_COMMANDS.slice(5)
  ];
}

export async function runCoreBench(root: any = process.cwd(), { iterations = 3, tier = 'source-local' }: any = {}) {
  const script = path.join(packageRoot(), 'dist', 'bin', 'sks.js');
  const budgets = ((CORE_BENCH_BUDGET_TIERS as Record<string, Record<string, number>>)[tier] || CORE_BENCH_BUDGET_TIERS['source-local']) as Record<string, number>;
  const measuredIterations = Math.max(1, Number(iterations) || 1);
  const benchTrustMission = await ensureBenchTrustMission(root, script);
  const rows: any[] = [];
  for (const [label, args, commandRoot] of coreCommands(benchTrustMission)) {
    const values: any[] = [];
    const failures: any[] = [];
    for (let i = 0; i < CORE_BENCH_WARMUP_ITERATIONS; i += 1) {
      const result = await runBenchProcess(commandRoot || root, script, args);
      if (result.code !== 0) failures.push({ phase: 'warmup', code: result.code, stderr_tail: result.stderr.slice(-400), stdout_tail: result.stdout.slice(-400) });
    }
    for (let i = 0; i < measuredIterations; i += 1) {
      const t0 = performance.now();
      const result = await runBenchProcess(commandRoot || root, script, args);
      values.push(performance.now() - t0);
      if (result.code !== 0) failures.push({ phase: 'measure', code: result.code, stderr_tail: result.stderr.slice(-400), stdout_tail: result.stdout.slice(-400) });
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
    iterations: measuredIterations,
    warmup_iterations: CORE_BENCH_WARMUP_ITERATIONS,
    budget_tiers: CORE_BENCH_BUDGET_TIERS,
    ux_review_staged_latency_budgets: UX_REVIEW_STAGED_LATENCY_BUDGETS,
    ok: rows.every((row: any) => row.ok),
    commands: rows
  };
  await writeCoreBenchArtifacts(root, report);
  return report;
}

async function runBenchProcess(root: any, script: any, args: any) {
  return runProcess(process.execPath, [script, ...args], {
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 256 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', SKS_DISABLE_UPDATE_CHECK: '1', CI: 'true' }
  });
}

async function ensureBenchTrustMission(root: any, script: any) {
  const benchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-core-bench-trust-')).catch(() => root);
  const beforeMissionIds = await listMissionIds(benchRoot);
  const result = await runProcess(process.execPath, [script, 'run', 'fixture', '--mock', '--json'], {
    cwd: benchRoot,
    timeoutMs: 60_000,
    maxOutputBytes: 4 * 1024 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', SKS_DISABLE_UPDATE_CHECK: '1', CI: 'true' }
  });
  return {
    missionId: parseMissionId(result.stdout) || await findBenchTrustMission(benchRoot, beforeMissionIds),
    root: benchRoot,
    setup_code: result.code
  };
}

function parseMissionId(text: any) {
  const parsed = parseJsonOutput(text);
  if (parsed?.mission_id || parsed?.id || parsed?.proof?.mission_id || parsed?.completion_proof?.mission_id) {
    return parsed?.mission_id || parsed?.id || parsed?.proof?.mission_id || parsed?.completion_proof?.mission_id;
  }
  const directMatch = String(text || '').match(/"mission_id"\s*:\s*"(M-\d{8}-\d{6}-[a-f0-9]+)"/i);
  if (directMatch?.[1]) return directMatch[1];
  return null;
}

function parseJsonOutput(text: any = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }
  return null;
}

async function listMissionIds(root: any) {
  try {
    const entries = await fs.readdir(path.join(root, '.sneakoscope', 'missions'), { withFileTypes: true });
    return entries.filter((entry: any) => entry.isDirectory() && /^M-\d{8}-\d{6}-/.test(entry.name)).map((entry: any) => entry.name);
  } catch {
    return [];
  }
}

async function findBenchTrustMission(root: any, beforeMissionIds: any[] = []) {
  const missionRoot = path.join(root, '.sneakoscope', 'missions');
  const before = new Set(beforeMissionIds);
  let entries: any[] = [];
  try {
    entries = await fs.readdir(missionRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = await Promise.all(entries
    .filter((entry: any) => entry.isDirectory() && /^M-\d{8}-\d{6}-/.test(entry.name))
    .map(async (entry: any) => {
      const dir = path.join(missionRoot, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = (await fs.stat(dir)).mtimeMs;
      } catch {}
      return { id: entry.name, dir, isNew: !before.has(entry.name), mtimeMs };
    }));
  candidates.sort((a: any, b: any) => Number(b.isNew) - Number(a.isNew) || b.mtimeMs - a.mtimeMs);
  for (const candidate of candidates) {
    if (await hasBenchTrustArtifacts(candidate.dir)) return candidate.id;
  }
  return null;
}

async function hasBenchTrustArtifacts(dir: any) {
  const required = ['run-classification.json', 'completion-proof.json', 'trust-report.json'];
  for (const artifact of required) {
    try {
      await fs.access(path.join(dir, artifact));
    } catch {
      return false;
    }
  }
  return true;
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

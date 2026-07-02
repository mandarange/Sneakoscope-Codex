#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, nowIso, readJson, runProcess, writeJsonAtomic } from '../core/fsx.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tasksRoot = path.join(root, 'bench', 'tasks');
const reportPath = path.join(root, '.sneakoscope', 'reports', 'bench-report.json');
const baselinePath = path.join(root, 'config', 'bench-baseline.json');

const baseline = await readJson<any>(baselinePath, { schema: 'sks.coding-bench-baseline.v1', pass_rate: 0, min_pass_rate: 0 });
const tasks = await loadTasks();
const backend = backendAvailable();
const perTask = [];

for (const task of tasks) {
  if (!backend.ok) {
    perTask.push({
      id: task.id,
      kind: task.kind,
      ok: true,
      status: 'skipped',
      skipped_reason: backend.reason
    });
    continue;
  }
  perTask.push(await runTask(task));
}

const executed = perTask.filter((task) => task.status !== 'skipped');
const pass = executed.filter((task) => task.ok).length;
const fail = executed.filter((task) => !task.ok).length;
const skipped = perTask.length - executed.length;
const passRate = executed.length ? pass / executed.length : 0;
const baselineRate = Number(baseline.pass_rate ?? baseline.min_pass_rate ?? 0);
const ok = fail === 0 && passRate >= baselineRate;
const report = {
  schema: 'sks.coding-bench-report.v1',
  generated_at: nowIso(),
  ok,
  pass,
  fail,
  skipped,
  total: perTask.length,
  pass_rate: passRate,
  baseline: {
    path: path.relative(root, baselinePath),
    pass_rate: baselineRate,
    baseline_version: baseline.baseline_version || null
  },
  backend,
  per_task: perTask
};

await ensureDir(path.dirname(reportPath));
await writeJsonAtomic(reportPath, report);
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);

async function loadTasks() {
  const dirs = (await fs.readdir(tasksRoot, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const rows = [];
  for (const dir of dirs) {
    const taskPath = path.join(tasksRoot, dir, 'task.json');
    const task = await readJson<any>(taskPath, null);
    if (task?.schema === 'sks.bench-task.v1') rows.push({ ...task, dir, task_path: taskPath, repo_path: path.join(tasksRoot, dir, 'repo') });
  }
  return rows;
}

function backendAvailable() {
  if (process.env.SKS_RUN_CODING_BENCH_REAL !== '1') return { ok: false, reason: 'no_backend' };
  if (process.env.OPENAI_API_KEY || process.env.SKS_CODEX_LB_READY === '1' || process.env.SKS_CODING_BENCH_ALLOW_NO_KEY === '1') return { ok: true, reason: null };
  return { ok: false, reason: 'no_backend' };
}

async function runTask(task: any) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), `sks-coding-bench-${task.id}-`));
  await fs.cp(task.repo_path, scratch, { recursive: true });
  await initGit(scratch);
  const sks = path.join(root, 'dist', 'bin', 'sks.js');
  const run = await runProcess(process.execPath, [sks, 'naruto', 'run', task.prompt, '--json', '--no-open-zellij', '--apply-patches', '--tournament', task.kind === 'refactor' ? '3' : '0'], {
    cwd: scratch,
    timeoutMs: 10 * 60_000,
    maxOutputBytes: 512 * 1024,
    env: { ...process.env, SKS_CODING_BENCH_TASK_ID: task.id }
  });
  const grade = await gradeTask(task, scratch);
  return {
    id: task.id,
    kind: task.kind,
    ok: run.code === 0 && grade.ok,
    status: run.code === 0 && grade.ok ? 'passed' : 'failed',
    command_exit: run.code,
    grade,
    scratch
  };
}

async function initGit(cwd: string) {
  await runProcess('git', ['init'], { cwd, timeoutMs: 15_000, maxOutputBytes: 64 * 1024 }).catch(() => null);
  await runProcess('git', ['config', 'user.email', 'bench@sneakoscope.local'], { cwd, timeoutMs: 15_000, maxOutputBytes: 64 * 1024 }).catch(() => null);
  await runProcess('git', ['config', 'user.name', 'Sneakoscope Bench'], { cwd, timeoutMs: 15_000, maxOutputBytes: 64 * 1024 }).catch(() => null);
  await runProcess('git', ['add', '.'], { cwd, timeoutMs: 15_000, maxOutputBytes: 64 * 1024 }).catch(() => null);
  await runProcess('git', ['commit', '-m', 'bench baseline'], { cwd, timeoutMs: 15_000, maxOutputBytes: 64 * 1024 }).catch(() => null);
}

async function gradeTask(task: any, cwd: string) {
  const success = task.success || {};
  const test = success.command ? await runProcess('sh', ['-lc', String(success.command)], { cwd, timeoutMs: 120_000, maxOutputBytes: 256 * 1024 }) : { code: 0, stdout: '', stderr: '' };
  const diff = await runProcess('git', ['diff', '--numstat', 'HEAD'], { cwd, timeoutMs: 15_000, maxOutputBytes: 128 * 1024 }).catch(() => ({ stdout: '' }));
  const changed = await runProcess('git', ['diff', '--name-only', 'HEAD'], { cwd, timeoutMs: 15_000, maxOutputBytes: 128 * 1024 }).catch(() => ({ stdout: '' }));
  const patch = await runProcess('git', ['diff', 'HEAD'], { cwd, timeoutMs: 15_000, maxOutputBytes: 512 * 1024 }).catch(() => ({ stdout: '' }));
  const diffLines = String(diff.stdout || '').split(/\r?\n/).filter(Boolean).reduce((sum, line) => {
    const parts = line.split(/\s+/).map((value) => Number(value));
    const added = parts[0] ?? 0;
    const removed = parts[1] ?? 0;
    return sum + (Number.isFinite(added) ? added : 0) + (Number.isFinite(removed) ? removed : 0);
  }, 0);
  const changedFiles = String(changed.stdout || '').split(/\r?\n/).filter(Boolean);
  const forbidden = (success.forbidden_patterns || []).filter((pattern: string) => new RegExp(pattern, 'm').test(String(patch.stdout || '')));
  const missingNewTest = success.must_contain_new_test === true && !changedFiles.some((file) => /\.(test|spec)\.[cm]?[jt]s$|test\.[cm]?js$|__tests__\//.test(file));
  const tooLarge = Number(success.max_diff_lines || Infinity) < diffLines;
  const ok = (success.must_pass !== true || test.code === 0) && !missingNewTest && !tooLarge && forbidden.length === 0;
  return {
    ok,
    test_exit: test.code,
    diff_lines: diffLines,
    changed_files: changedFiles,
    forbidden_patterns: forbidden,
    missing_new_test: missingNewTest,
    max_diff_lines_exceeded: tooLarge,
    stdout_tail: String(test.stdout || '').slice(-4000),
    stderr_tail: String(test.stderr || '').slice(-4000)
  };
}

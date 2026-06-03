#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const issues = [];
for (const rel of [
  'src/core/verification/verification-dag.ts',
  'src/core/verification/verification-worker-pool.ts',
  'src/core/verification/verification-artifact-lock.ts',
  'src/core/verification/verification-result.ts',
  'src/core/verification/verification-proof.ts',
  'src/scripts/release-parallel-check.ts'
]) {
  if (!fs.existsSync(path.join(root, rel))) issues.push(`missing:${rel}`);
}

await runFixture();
const releaseSource = read('src/scripts/release-parallel-check.ts');
for (const token of ['runVerificationDag', 'buildVerificationDag', 'writeParallelVerificationProof']) {
  if (!releaseSource.includes(token)) issues.push(`release_parallel_runner_missing:${token}`);
}

const result = { schema: 'sks.parallel-verification-engine-check.v1', ok: issues.length === 0, issues };
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

async function runFixture() {
  const dagPath = path.join(root, 'dist', 'core', 'verification', 'verification-dag.js');
  const poolPath = path.join(root, 'dist', 'core', 'verification', 'verification-worker-pool.js');
  if (!fs.existsSync(dagPath) || !fs.existsSync(poolPath)) return;
  const dagMod = await import(pathToFileURL(dagPath).href);
  const poolMod = await import(pathToFileURL(poolPath).href);
  const dag = dagMod.buildVerificationDag([
    { id: 'a', command: `${process.execPath} -e "process.exit(0)"`, outputs: ['a.json'] },
    { id: 'b', command: `${process.execPath} -e "process.exit(0)"`, dependencies: ['a'], outputs: ['b.json'] }
  ]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-verify-'));
  const result = await poolMod.runVerificationDag(dag, { cwd: root, concurrency: 2, logDir: tmp });
  if (!result.ok || result.task_count !== 2) issues.push('fixture_parallel_verification_failed');
  const failedDag = dagMod.buildVerificationDag([
    { id: 'fail', command: `${process.execPath} -e "process.exit(3)"`, outputs: ['fail.json'] },
    { id: 'after', command: `${process.execPath} -e "process.exit(0)"`, dependencies: ['fail'], outputs: ['after.json'] }
  ]);
  const failed = await poolMod.runVerificationDag(failedDag, { cwd: root, concurrency: 2, logDir: tmp });
  const after = failed.results.find((row) => row.id === 'after');
  if (!after?.skipped || failed.skipped !== 1 || failed.failed !== 1 || failed.task_count !== 2) issues.push('fixture_failed_dependency_not_skipped');
  const timeoutDag = dagMod.buildVerificationDag([
    { id: 'slow', command: `${process.execPath} -e "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),200)); setInterval(()=>{},50)"`, timeout_ms: 20, outputs: ['slow.json'] }
  ]);
  const timeoutResult = await poolMod.runVerificationDag(timeoutDag, { cwd: root, concurrency: 1, logDir: tmp });
  const slow = timeoutResult.results.find((row) => row.id === 'slow');
  if (!slow?.error?.startsWith('timeout:') || slow.duration_ms < 20) issues.push('fixture_timeout_process_tree_not_reported');
  try {
    dagMod.buildVerificationDag([
      { id: 'x', command: 'true', outputs: ['same'] },
      { id: 'y', command: 'true', outputs: ['same'] }
    ]);
    issues.push('fixture_output_conflict_not_blocked');
  } catch {}
  try {
    dagMod.buildVerificationDag([
      { id: 'x', command: 'true', outputs: ['reports/x.json'] },
      { id: 'y', command: 'true', outputs: ['reports/../reports/x.json'] }
    ]);
    issues.push('fixture_normalized_output_conflict_not_blocked');
  } catch {}
}

function read(rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; }
}

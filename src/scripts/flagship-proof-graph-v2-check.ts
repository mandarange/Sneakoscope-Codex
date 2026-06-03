#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeCodexHookOfficialParityReport } from '../core/codex-hooks/codex-hook-official-parity.js';
import { validateFlagshipProofGraph } from '../core/evidence/flagship-proof-graph-validator.js';

const root = process.cwd();
await refreshDependencyReports(root);
const report = await validateFlagshipProofGraph(process.cwd());
const out = path.join(process.cwd(), '.sneakoscope', 'reports', 'flagship-proof-graph-v2.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

async function refreshDependencyReports(root) {
  await writeCodexHookOfficialParityReport(root, {
    outputPath: path.join(root, '.sneakoscope', 'reports', 'codex-hook-parity-1.14.1.json')
  });
  for (const script of [
    './dist/scripts/imagegen-real-smoke-check.js',
    './dist/scripts/ppt-full-e2e-blackbox-check.js',
    './dist/scripts/evidence-flagship-coverage-check.js'
  ]) {
    const run = spawnSync(process.execPath, [script], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024
    });
    if (run.status !== 0) {
      const report = {
        schema: 'sks.flagship-proof-graph.v2',
        ok: false,
        blocker: `dependency_report_failed:${script}`,
        stdout_tail: run.stdout.slice(-2000),
        stderr_tail: run.stderr.slice(-2000)
      };
      const out = path.join(root, '.sneakoscope', 'reports', 'flagship-proof-graph-v2.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
  }
}

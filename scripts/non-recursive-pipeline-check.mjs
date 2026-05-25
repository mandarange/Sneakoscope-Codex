#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nonRecursivePipelineMarkdown,
  scanNonRecursivePipelinePolicy
} from '../dist/core/agents/agent-recursion-guard.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, '..');
const args = process.argv.slice(2);
const root = path.resolve(readFlag('--root') || defaultRoot);
const json = args.includes('--json');
const noWrite = args.includes('--no-write');
const outputDir = path.join(root, '.sneakoscope', 'reports');

const report = scanNonRecursivePipelinePolicy(collectScanRecords(root));

if (!noWrite) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'non-recursive-pipeline-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'non-recursive-pipeline-report.md'), nonRecursivePipelineMarkdown(report));
}

if (json) console.log(JSON.stringify(report, null, 2));
else console.log(`non-recursive-pipeline: ${report.ok ? 'pass' : 'blocked'} (${report.violations.length} violation(s), ${report.scanned_records.length} record(s), ${report.elapsed_ms}ms)`);
if (!report.ok || !report.performance_ok || !report.secret_redaction_ok) process.exitCode = 1;

function readFlag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function collectScanRecords(scanRoot) {
  const candidates = [
    ['src/core/agents/agent-worker-pipeline.ts', 'source'],
    ['src/core/agents/agent-recursion-guard.ts', 'source'],
    ['src/core/agents/agent-runner-process.ts', 'source'],
    ['src/core/agents/agent-runner-codex-exec.ts', 'source'],
    ['src/core/agents/agent-runner-tmux.ts', 'source'],
    ['docs/agent-non-recursive-pipeline.md', 'docs'],
    ['docs/native-agent-kernel.md', 'docs']
  ];
  const records = [];
  for (const [rel, channel] of candidates) {
    const full = path.join(scanRoot, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    records.push({ path: rel, channel, text: fs.readFileSync(full, 'utf8') });
  }
  records.push({
    path: '.sneakoscope/reports/agent-worker.stdout.fixture.txt',
    channel: 'stdout',
    text: 'agent worker completed local slice; no nested route requested'
  });
  records.push({
    path: '.sneakoscope/reports/agent-worker.stderr.fixture.txt',
    channel: 'stderr',
    text: 'agent worker stderr clean; no recursive SKS command emitted'
  });
  records.push({
    path: '.sneakoscope/reports/agent-result.fixture.json',
    channel: 'agent_result',
    text: JSON.stringify({
      schema: 'sks.agent-result.v1',
      status: 'done',
      recursion_guard: { ok: true, violations: [] },
      blockers: []
    })
  });
  return records;
}

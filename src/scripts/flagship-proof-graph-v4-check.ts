#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const reportDir = path.join(root, '.sneakoscope', 'reports');
fs.mkdirSync(reportDir, { recursive: true });

const initialFreshness = ensureDistFresh({ rebuild: true });
if (!initialFreshness.ok) fail('dist_not_fresh_before_dependencies', { freshness: initialFreshness });

const dependencies = [
  ['flagship-proof-graph-v3.json', './dist/scripts/flagship-proof-graph-v3-check.js'],
  ['mad-sks-actual-executor-blackbox.json', './dist/scripts/mad-sks-actual-executor-blackbox.js'],
  ['mad-sks-file-write-executor.json', './dist/scripts/mad-sks-file-write-executor-check.js'],
  ['mad-sks-shell-executor.json', './dist/scripts/mad-sks-shell-executor-check.js'],
  ['mad-sks-package-executor.json', './dist/scripts/mad-sks-package-executor-check.js'],
  ['mad-sks-service-executor.json', './dist/scripts/mad-sks-service-executor-check.js'],
  ['mad-sks-db-executor.json', './dist/scripts/mad-sks-db-executor-check.js'],
  ['mad-sks-rollback-apply.json', './dist/scripts/mad-sks-rollback-apply-check.js'],
  ['mad-sks-live-protected-core-smoke.json', './dist/scripts/mad-sks-live-protected-core-smoke.js'],
  ['mad-sks-executor-proof-graph.json', './dist/scripts/mad-sks-executor-proof-graph-check.js']
];

for (const [name, script] of dependencies) {
  const run = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 20 * 1024 * 1024 });
  const parsed = parseLastJson(run.stdout);
  if (parsed) fs.writeFileSync(path.join(reportDir, name), `${JSON.stringify(parsed, null, 2)}\n`);
  if (run.status !== 0) fail(`dependency_failed:${script}`, { stdout_tail: run.stdout.slice(-3000), stderr_tail: run.stderr.slice(-3000) });
}

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'evidence', 'flagship-proof-graph-validator.js')).href);
const report = await mod.validateFlagshipProofGraphV4(root);
fs.writeFileSync(path.join(reportDir, 'flagship-proof-graph-v4.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

function fail(blocker, extra = {}) {
  const report = { schema: 'sks.flagship-proof-graph.v4', ok: false, blocker, ...extra };
  fs.writeFileSync(path.join(reportDir, 'flagship-proof-graph-v4.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

function parseLastJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const start = raw.lastIndexOf('\n{');
  const jsonText = start >= 0 ? raw.slice(start + 1) : raw;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

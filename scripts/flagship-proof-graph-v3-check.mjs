#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const reportDir = path.join(root, '.sneakoscope', 'reports');
fs.mkdirSync(reportDir, { recursive: true });

const initialFreshness = ensureDistFresh({ rebuild: true });
if (!initialFreshness.ok) {
  const report = { schema: 'sks.flagship-proof-graph.v3', ok: false, blocker: 'dist_not_fresh_before_dependencies', freshness: initialFreshness };
  fs.writeFileSync(path.join(reportDir, 'flagship-proof-graph-v3.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const dependencies = [
  ['flagship-proof-graph-v2.json', './scripts/flagship-proof-graph-v2-check.mjs'],
  ['mad-sks-permission-model.json', './scripts/mad-sks-permission-model-check.mjs'],
  ['mad-sks-immutable-harness.json', './scripts/mad-sks-immutable-harness-check.mjs'],
  ['mad-sks-write-guard.json', './scripts/mad-sks-write-guard-check.mjs'],
  ['mad-sks-audit-proof.json', './scripts/mad-sks-audit-proof-check.mjs'],
  ['mad-sks-no-harness-modification.json', './scripts/mad-sks-no-harness-modification-check.mjs'],
  ['legacy-multiagent-removal.json', './scripts/legacy-multiagent-removal-check.mjs'],
  ['release-native-agent-fixture-check.json', './scripts/release-native-agent-fixture-check.mjs'],
  ['codex-exec-output-schema-actual-syntax.json', './scripts/codex-exec-output-schema-actual-syntax-check.mjs'],
  ['release-dist-freshness.json', './scripts/release-dist-freshness-check.mjs']
];

for (const [name, script] of dependencies) {
  const run = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 20 * 1024 * 1024 });
  const parsed = parseLastJson(run.stdout);
  if (parsed) fs.writeFileSync(path.join(reportDir, name), `${JSON.stringify(parsed, null, 2)}\n`);
  if (run.status !== 0) {
    const report = { schema: 'sks.flagship-proof-graph.v3', ok: false, blocker: `dependency_failed:${script}`, stdout_tail: run.stdout.slice(-3000), stderr_tail: run.stderr.slice(-3000) };
    fs.writeFileSync(path.join(reportDir, 'flagship-proof-graph-v3.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) {
  const report = { schema: 'sks.flagship-proof-graph.v3', ok: false, blocker: 'dist_not_fresh', freshness };
  fs.writeFileSync(path.join(reportDir, 'flagship-proof-graph-v3.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'evidence', 'flagship-proof-graph-validator.js')).href);
const report = await mod.validateFlagshipProofGraphV3(root);
fs.writeFileSync(path.join(reportDir, 'flagship-proof-graph-v3.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

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

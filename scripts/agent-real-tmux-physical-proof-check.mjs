#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

const reportPath = path.join(root, '.sneakoscope', 'reports', 'agent-real-tmux-physical-proof-1.18.5.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const required = process.env.SKS_REQUIRE_REAL_TMUX === '1';

if (process.env.SKS_TEST_REAL_TMUX !== '1') {
  optionalOrBlocked('set SKS_TEST_REAL_TMUX=1 to run real tmux physical pane proof', 'real_tmux_not_requested');
}
const tmux = spawnSync('tmux', ['-V'], { encoding: 'utf8' });
if (tmux.status !== 0) {
  optionalOrBlocked('tmux binary unavailable', 'tmux_missing');
}
const run = spawnSync(process.execPath, [
  'dist/bin/sks.js',
  'agent',
  'run',
  'real tmux physical pane proof smoke',
  '--backend', 'tmux',
  '--real',
  '--json',
  '--agents', '2',
  '--target-active-slots', '2',
  '--minimum-work-items', '2',
  '--work-items', '3'
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE: '1' },
  maxBuffer: 1024 * 1024 * 16,
  timeout: Number(process.env.SKS_REAL_TMUX_TIMEOUT_MS || 120000)
});
assertGate(run.status === 0, 'real tmux physical proof command failed', { stdout: run.stdout.slice(-4000), stderr: run.stderr.slice(-4000) });
const json = parseJson(run.stdout);
const ledgerRoot = path.join(root, json.ledger_root || '');
const proof = readJson(path.join(ledgerRoot, 'agent-tmux-physical-proof.json'));
const summary = readJson(path.join(ledgerRoot, 'agent-tmux-physical-proof-summary.json'));
const before = readJson(path.join(ledgerRoot, 'agent-tmux-physical-proof-before-drain.json'));
const after = readJson(path.join(ledgerRoot, 'agent-tmux-physical-proof-after-drain.json'));
const final = readJson(path.join(ledgerRoot, 'agent-tmux-physical-proof-final.json'));
const report = {
  ...proof,
  schema: 'sks.real-tmux-physical-proof.v2',
  release_version: '1.18.5',
  mission_id: json.mission_id,
  required,
  lifecycle_phases: {
    before_drain: { artifact: 'agent-tmux-physical-proof-before-drain.json', ok: before.ok, status: before.status },
    after_drain: { artifact: 'agent-tmux-physical-proof-after-drain.json', ok: after.ok, status: after.status },
    final: { artifact: 'agent-tmux-physical-proof-final.json', ok: final.ok, status: final.status }
  },
  summary
};
writeReport(report);
assertGate(proof.status === 'passed' && proof.physical_tmux_verified === true, 'real tmux physical proof must pass when explicitly enabled', proof);
assertGate(before && after && final && summary.ok === true, 'real tmux lifecycle phase artifacts must exist and summarize cleanly', report);
emitGate('agent:real-tmux-physical-proof', { status: proof.status, mission_id: json.mission_id, capture_count: proof.tmux_capture_pane_artifacts?.length || 0 });

function optionalOrBlocked(reason, code) {
  const report = {
    ok: !required,
    status: required ? 'blocked' : 'integration_optional',
    schema: 'sks.real-tmux-physical-proof.v2',
    release_version: '1.18.5',
    required,
    reason,
    blockers: required ? [code] : []
  };
  writeReport(report);
  emitGate('agent:real-tmux-physical-proof', { status: report.status, reason: code });
  process.exit(required ? 1 : 0);
}

function writeReport(report) {
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function parseJson(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  return JSON.parse(stdout.slice(start, end + 1));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

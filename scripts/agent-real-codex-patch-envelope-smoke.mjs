#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

const reportPath = path.join(root, '.sneakoscope', 'reports', 'agent-real-codex-patch-envelope-smoke.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const required = process.env.SKS_REQUIRE_REAL_CODEX_PATCHES === '1';

if (process.env.SKS_TEST_REAL_CODEX_PATCHES !== '1') {
  optionalOrBlocked('set SKS_TEST_REAL_CODEX_PATCHES=1 to run real Codex patch envelope smoke', 'real_codex_patch_smoke_not_requested');
}

const help = spawnSync('codex', ['exec', '--help'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
if (help.status !== 0) optionalOrBlocked('codex exec binary unavailable', 'codex_missing', { stderr: help.stderr?.slice(-2000) || '' });
const helpText = `${help.stdout}\n${help.stderr}`;
if (!helpText.includes('--output-schema') || !helpText.includes('--output-last-message')) optionalOrBlocked('codex exec output schema flags unavailable', 'output_schema_unsupported');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-real-codex-patches-'));
fs.mkdirSync(path.join(fixture, '.sneakoscope'), { recursive: true });
for (const file of ['alpha.txt', 'beta.txt', 'gamma.txt']) fs.writeFileSync(path.join(fixture, file), `${file}: before\n`);
const prompt = [
  'Real Codex patch envelope smoke.',
  'Return valid JSON matching schemas/codex/agent-result.schema.json.',
  'Populate patch_envelopes with schema sks.agent-patch-envelope.v1 for alpha.txt, beta.txt, and gamma.txt.',
  'Use write operations only inside this temp project, include lease_proof strategy_task_id, verification_node_id, rollback_node_id, and rollback_hint.'
].join(' ');
const run = spawnSync(process.execPath, [
  path.join(root, 'dist', 'bin', 'sks.js'),
  'agent',
  'run',
  prompt,
  '--route', '$Agent',
  '--backend', 'codex-exec',
  '--real',
  '--agents', '2',
  '--target-active-slots', '2',
  '--minimum-work-items', '2',
  '--work-items', '3',
  '--write-mode', 'parallel',
  '--apply-patches',
  '--max-write-agents', '2',
  '--json'
], { cwd: fixture, encoding: 'utf8', env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }, timeout: Number(process.env.SKS_REAL_CODEX_PATCH_TIMEOUT_MS || 10 * 60 * 1000), maxBuffer: 1024 * 1024 * 32 });
assertGate(run.status === 0, 'real Codex patch smoke command failed', { stdout: run.stdout.slice(-4000), stderr: run.stderr.slice(-4000) });
const json = parseJson(run.stdout);
const ledgerRoot = path.join(fixture, json.ledger_root || '');
const queue = readJson(path.join(ledgerRoot, 'agent-patch-queue.json'), null);
const apply = readJson(path.join(ledgerRoot, 'agent-patch-apply-results.json'), null);
const rollback = readJson(path.join(ledgerRoot, 'agent-patch-rollback-proof.json'), null);
const verification = readJson(path.join(ledgerRoot, 'agent-patch-verification-results.json'), null);
const processReports = listNamedFiles(path.join(ledgerRoot, 'sessions'), 'agent-process-report.json').map((file) => readJson(file, null)).filter(Boolean);
const result = {
  schema: 'sks.agent-real-codex-patch-envelope-smoke.v1',
  ok: true,
  status: 'passed',
  proof_level: process.env.SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE === '1' ? 'fixture_instrumented_real' : 'proven',
  required,
  fixture_root: fixture,
  mission_id: json.mission_id,
  patch_envelope_count: queue?.entries?.length || 0,
  queue_enqueue_ok: (queue?.entries?.length || 0) >= 3,
  patch_apply_ok: apply?.results?.every?.((row) => row.ok === true) === true,
  rollback_ok: rollback?.ok === true,
  verification_ok: verification?.ok === true,
  protected_path_violations: (queue?.entries || []).some((entry) => {
    const lease = entry.envelope?.lease_proof || {};
    return lease.protected_path_check === 'blocked' || (entry.violations || []).some((violation) => String(violation).startsWith('protected_path:'));
  }),
  process_report_profiles: processReports.map((row) => ({ profile: row.profile || null, managed_proxy_env_keys: row.managed_proxy_env_keys || [] })),
  blockers: []
};
result.blockers.push(...(result.queue_enqueue_ok ? [] : ['real_codex_patch_queue_enqueue_missing']));
result.blockers.push(...(result.patch_apply_ok ? [] : ['real_codex_patch_apply_failed']));
result.blockers.push(...(result.rollback_ok ? [] : ['real_codex_patch_rollback_proof_missing']));
result.blockers.push(...(result.verification_ok ? [] : ['real_codex_patch_verification_missing']));
result.blockers.push(...(!result.protected_path_violations ? [] : ['real_codex_patch_protected_path_violation']));
result.ok = result.blockers.length === 0;
result.status = result.ok ? 'passed' : 'blocked';
result.proof_level = result.ok ? result.proof_level : 'blocked';
writeReport(result);
assertGate(result.ok === true, 'real Codex patch envelope smoke failed', result);
emitGate('agent:real-codex-patch-envelope-smoke', { status: result.status, patch_envelope_count: result.patch_envelope_count });

function optionalOrBlocked(reason, code, extra = {}) {
  const report = {
    schema: 'sks.agent-real-codex-patch-envelope-smoke.v1',
    ok: !required,
    status: required ? 'blocked' : 'integration_optional',
    proof_level: required ? 'real_required_missing' : 'integration_optional',
    required,
    reason,
    blockers: required ? [code] : [],
    ...extra
  };
  writeReport(report);
  emitGate('agent:real-codex-patch-envelope-smoke', { status: report.status, reason: code });
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

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (arguments.length > 1) return fallback;
    throw err;
  }
}

function listNamedFiles(dir, name) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listNamedFiles(file, name));
    else if (entry.isFile() && entry.name === name) out.push(file);
  }
  return out;
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

const reportPath = path.join(root, '.sneakoscope', 'reports', 'agent-real-codex-dynamic-smoke-1.18.4.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

if (process.env.SKS_TEST_REAL_DYNAMIC_AGENTS !== '1') {
  writeReport({ ok: true, status: 'integration_optional', reason: 'set SKS_TEST_REAL_DYNAMIC_AGENTS=1 to run real codex exec dynamic smoke' });
  emitGate('agent:real-codex-dynamic-smoke', { status: 'integration_optional' });
  process.exit(0);
}

const codex = spawnSync('codex', ['exec', '--help'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
if (codex.status !== 0) {
  writeReport({ ok: true, status: 'integration_optional', reason: 'codex exec binary unavailable', stderr: codex.stderr?.slice(-2000) || '' });
  emitGate('agent:real-codex-dynamic-smoke', { status: 'integration_optional', reason: 'codex_missing' });
  process.exit(0);
}
const helpText = `${codex.stdout}\n${codex.stderr}`;
if (!helpText.includes('--output-schema') || !helpText.includes('--output-last-message')) {
  writeReport({ ok: true, status: 'integration_optional', reason: 'codex exec output schema flags unavailable' });
  emitGate('agent:real-codex-dynamic-smoke', { status: 'integration_optional', reason: 'output_schema_unsupported' });
  process.exit(0);
}

const full = process.argv.includes('--full');
const activeSlots = full ? 3 : 2;
const workItems = full ? 5 : 3;
const run = spawnSync(process.execPath, [
  'dist/bin/sks.js',
  'agent',
  'run',
  'real codex dynamic backfill read-only smoke: inspect package metadata and report no file changes',
  '--route', '$Agent',
  '--backend', 'codex-exec',
  '--real',
  '--readonly',
  '--json',
  '--agents', String(activeSlots),
  '--target-active-slots', String(activeSlots),
  '--minimum-work-items', String(activeSlots),
  '--work-items', String(workItems),
  '--max-queue-expansion', '10'
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE: '1' },
  maxBuffer: 1024 * 1024 * 32,
  timeout: Number(process.env.SKS_REAL_SMOKE_TIMEOUT_MS || 10 * 60 * 1000)
});
assertGate(run.status === 0, 'real codex dynamic smoke command failed', { stdout: run.stdout.slice(-4000), stderr: run.stderr.slice(-4000) });
const json = parseJson(run.stdout);
const ledgerRoot = path.join(root, json.ledger_root || '');
const proof = readJson(path.join(ledgerRoot, 'agent-proof-evidence.json'));
const scheduler = json.scheduler?.state || {};
const reports = listNamedFiles(path.join(ledgerRoot, 'sessions'), 'agent-process-report.json').map(readJson);
const changedFiles = (json.results || []).flatMap((row) => row.changed_files || []);
const terminal = readJson(path.join(ledgerRoot, 'agent-terminal-close-aggregate.json'), null);
const outputSchemaReports = reports.filter((row) => row.output_schema_used === true && row.output_last_message_path);
const result = {
  ok: true,
  status: 'passed',
  schema: 'sks.real-codex-dynamic-smoke.v1',
  generated_at: new Date().toISOString(),
  mission_id: json.mission_id,
  active_slots: activeSlots,
  work_items: workItems,
  scheduler_state: scheduler,
  proof_status: proof.status,
  output_schema_used: outputSchemaReports.length === reports.length && reports.length > 0,
  output_last_message_paths: outputSchemaReports.map((row) => row.output_last_message_path),
  process_report_count: reports.length,
  terminal_close_report: terminal ? 'agent-terminal-close-aggregate.json' : proof.terminal_close_report,
  changed_files: changedFiles,
  source_refs_ok: proof.source_intelligence_generation_refs_ok === true && proof.task_graph_source_refs_ok === true,
  goal_refs_ok: proof.goal_mode_generation_refs_ok === true && proof.task_graph_goal_refs_ok === true,
  backfill_count: scheduler.backfill_count || 0,
  expected_backfill_count: scheduler.expected_backfill_count || 0,
  blockers: []
};
result.blockers.push(...(result.output_schema_used ? [] : ['output_schema_not_used_by_all_workers']));
result.blockers.push(...(scheduler.backfill_count >= scheduler.expected_backfill_count ? [] : ['backfill_count_below_expected']));
result.blockers.push(...(changedFiles.length === 0 ? [] : ['real_smoke_changed_files_not_empty']));
result.blockers.push(...(result.source_refs_ok ? [] : ['source_intelligence_refs_missing']));
result.blockers.push(...(result.goal_refs_ok ? [] : ['goal_mode_refs_missing']));
result.ok = result.blockers.length === 0;
result.status = result.ok ? 'passed' : 'blocked';
writeReport(result);
assertGate(result.ok, 'real codex dynamic smoke proof failed', result);
emitGate('agent:real-codex-dynamic-smoke', { status: result.status, mission_id: result.mission_id, backfill_count: result.backfill_count });

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

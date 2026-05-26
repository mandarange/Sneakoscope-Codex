#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

const reportPath = path.join(root, '.sneakoscope', 'reports', 'agent-real-codex-dynamic-smoke-1.18.5.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const required = process.env.SKS_REQUIRE_REAL_DYNAMIC_AGENTS === '1';

if (process.env.SKS_TEST_REAL_DYNAMIC_AGENTS !== '1') {
  optionalOrBlocked('set SKS_TEST_REAL_DYNAMIC_AGENTS=1 to run real codex exec dynamic smoke', 'real_dynamic_agents_not_requested');
}

const codex = spawnSync('codex', ['exec', '--help'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
if (codex.status !== 0) {
  optionalOrBlocked('codex exec binary unavailable', 'codex_missing', { stderr: codex.stderr?.slice(-2000) || '' });
}
const helpText = `${codex.stdout}\n${codex.stderr}`;
if (!helpText.includes('--output-schema') || !helpText.includes('--output-last-message')) {
  optionalOrBlocked('codex exec output schema flags unavailable', 'output_schema_unsupported');
}

const full = process.argv.includes('--full');
const activeSlots = full ? 3 : 2;
const workItems = full ? 5 : 3;
const childEnv = { ...process.env };
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
  env: childEnv,
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
const resultFiles = reports.map((row) => resolveReportPath(ledgerRoot, row.result_file || row.output_last_message_path)).filter(Boolean);
const parsedResultFiles = resultFiles.map((file) => ({ file, exists: fs.existsSync(file), json: readJson(file, null) }));
const processCleanupOk = reports.every((row) => !row.pid || row.exit_code !== null || !processAlive(Number(row.pid)));
const fixtureInstrumented = childEnv.SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE === '1';
const result = {
  ok: true,
  status: fixtureInstrumented ? 'fixture_instrumented_real' : 'passed',
  schema: 'sks.real-codex-dynamic-smoke.v2',
  generated_at: new Date().toISOString(),
  release_version: '1.18.5',
  mission_id: json.mission_id,
  active_slots: activeSlots,
  work_items: workItems,
  default_bounded_smoke: !full,
  required,
  fixture_instrumented_real: fixtureInstrumented,
  scheduler_state: scheduler,
  proof_status: proof.status,
  output_schema_used: outputSchemaReports.length === reports.length && reports.length > 0,
  output_last_message_paths: outputSchemaReports.map((row) => row.output_last_message_path),
  result_files: parsedResultFiles.map((row) => ({ file: row.file, exists: row.exists, json_ok: Boolean(row.json) })),
  all_result_files_exist: parsedResultFiles.length === reports.length && parsedResultFiles.every((row) => row.exists),
  all_output_last_message_json_valid: parsedResultFiles.length === reports.length && parsedResultFiles.every((row) => row.json),
  all_agent_result_schemas_valid: (json.results || []).every((row) => !Array.isArray(row.blockers) || !row.blockers.some((blocker) => String(blocker).startsWith('schema_invalid:'))),
  process_report_count: reports.length,
  terminal_close_report: terminal ? 'agent-terminal-close-aggregate.json' : proof.terminal_close_report,
  terminal_close_reports_ok: Boolean(terminal) || proof.terminal_sessions_closed === true,
  process_cleanup_ok: processCleanupOk,
  changed_files: changedFiles,
  source_refs_ok: proof.source_intelligence_generation_refs_ok === true && proof.task_graph_source_refs_ok === true,
  goal_refs_ok: proof.goal_mode_generation_refs_ok === true && proof.task_graph_goal_refs_ok === true,
  backfill_count: scheduler.backfill_count || 0,
  expected_backfill_count: scheduler.expected_backfill_count || 0,
  blockers: []
};
result.blockers.push(...(result.output_schema_used ? [] : ['output_schema_not_used_by_all_workers']));
result.blockers.push(...(result.all_result_files_exist ? [] : ['worker_result_file_missing']));
result.blockers.push(...(result.all_output_last_message_json_valid ? [] : ['output_last_message_json_parse_failed']));
result.blockers.push(...(result.all_agent_result_schemas_valid ? [] : ['agent_result_schema_invalid']));
result.blockers.push(...(scheduler.backfill_count >= scheduler.expected_backfill_count ? [] : ['backfill_count_below_expected']));
result.blockers.push(...(result.terminal_close_reports_ok ? [] : ['terminal_close_reports_missing']));
result.blockers.push(...(result.process_cleanup_ok ? [] : ['worker_process_cleanup_failed']));
result.blockers.push(...(changedFiles.length === 0 ? [] : ['real_smoke_changed_files_not_empty']));
result.blockers.push(...(result.source_refs_ok ? [] : ['source_intelligence_refs_missing']));
result.blockers.push(...(result.goal_refs_ok ? [] : ['goal_mode_refs_missing']));
result.ok = result.blockers.length === 0;
result.status = result.ok ? (fixtureInstrumented ? 'fixture_instrumented_real' : 'passed') : 'blocked';
writeReport(result);
assertGate(result.ok, 'real codex dynamic smoke proof failed', result);
emitGate('agent:real-codex-dynamic-smoke', { status: result.status, mission_id: result.mission_id, backfill_count: result.backfill_count });

function optionalOrBlocked(reason, code, extra = {}) {
  const report = {
    ok: !required,
    status: required ? 'blocked' : 'integration_optional',
    schema: 'sks.real-codex-dynamic-smoke.v2',
    release_version: '1.18.5',
    required,
    reason,
    blockers: required ? [code] : [],
    ...extra
  };
  writeReport(report);
  emitGate('agent:real-codex-dynamic-smoke', { status: report.status, reason: code });
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

function resolveReportPath(ledgerRoot, file) {
  if (!file) return '';
  return path.isAbsolute(file) ? file : path.join(ledgerRoot, file);
}

function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
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

#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const args = process.argv.slice(2);
const manager = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-worker-pane-manager.js')).href);
const slotPaneProof = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'agent-slot-pane-binding-proof.js')).href);
const swarmSource = await fs.readFile(path.join(root, 'src', 'core', 'agents', 'native-cli-session-swarm.ts'), 'utf8');
const routerSource = await fs.readFile(path.join(root, 'src', 'core', 'agents', 'native-worker-backend-router.ts'), 'utf8');
const controlSource = await fs.readFile(path.join(root, 'src', 'core', 'codex-control', 'codex-task-runner.ts'), 'utf8');
const sourceOk = swarmSource.includes('native_cli_process_in_zellij_worker_pane')
  && swarmSource.includes('openWorkerPane')
  && swarmSource.includes('worker-process-report.json')
  && swarmSource.includes('codex_sdk_thread_started')
  && routerSource.includes("backend === 'codex-sdk' || backend === 'zellij'")
  && routerSource.includes('runCodexTask')
  && controlSource.includes('codex-sdk-events.jsonl')
  && routerSource.includes('codex-thread-registry.json');
const eventProof = manager.evaluateZellijWorkerPaneSpawnOrder([
  { event_type: 'session_launch_started' },
  { event_type: 'zellij_worker_pane_created' },
  { event_type: 'worker_started' },
  { event_type: 'codex_sdk_thread_started' },
  { event_type: 'result_written' },
  { event_type: 'pane_closed' }
]);
const requireReal = process.env.SKS_REQUIRE_REAL_CODEX_ZELLIJ === '1'
  || (process.env.SKS_REQUIRE_ZELLIJ === '1' && process.env.SKS_REQUIRE_CODEX_SDK === '1')
  || args.includes('--require-real');
if (!requireReal) {
  const ok = sourceOk && eventProof.ok;
  await emit({
    schema: 'sks.agent-real-codex-in-zellij-worker-pane-check.v1',
    ok,
    source_ok: sourceOk,
    event_proof: eventProof,
    integration_optional: true,
    real_execution: null,
    blockers: ok ? [] : ['agent_real_codex_in_zellij_worker_pane_source_check_failed']
  });
} else {
  await runRealGate({ sourceOk, eventProof });
}

async function runRealGate({ sourceOk, eventProof }) {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const missionId = `M-real-codex-zellij-${stamp}`;
  const sessionName = `sks-${missionId}`;
  const childEnv = { ...process.env };
  delete childEnv.SKS_CODEX_SDK_FAKE;
  delete childEnv.SKS_CODEX_SDK_FIXTURE;
  if (childEnv.NODE_ENV === 'test') delete childEnv.NODE_ENV;
  Object.assign(childEnv, {
    SKS_REQUIRE_ZELLIJ: '1',
    SKS_REQUIRE_CODEX_SDK: '1',
    SKS_CODEX_SDK_REQUIRE_REAL: '1',
    SKS_ZELLIJ_CLOSE_WORKER_PANE: '1',
    SKS_ZELLIJ_WORKER_HEARTBEAT_TIMEOUT_MS: childEnv.SKS_ZELLIJ_WORKER_HEARTBEAT_TIMEOUT_MS || '30000',
    SKS_ZELLIJ_WORKER_RESULT_TIMEOUT_MS: childEnv.SKS_ZELLIJ_WORKER_RESULT_TIMEOUT_MS || '180000',
    SKS_REAL_SMOKE_TIMEOUT_MS: childEnv.SKS_REAL_SMOKE_TIMEOUT_MS || '300000'
  });
  const command = [
    'dist/bin/sks.js',
    'agent',
    'run',
    'real codex zellij worker pane read-only smoke: inspect package metadata and report no file changes',
    '--route', '$Agent',
    '--backend', 'zellij',
    '--real',
    '--readonly',
    '--json',
    '--agents', '1',
    '--target-active-slots', '1',
    '--minimum-work-items', '1',
    '--work-items', '1',
    '--concurrency', '1',
    '--mission', missionId
  ];
  const run = spawnSync(process.execPath, command, {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: Number(childEnv.SKS_REAL_SMOKE_TIMEOUT_MS || 300000)
  });
  spawnSync('zellij', ['kill-session', sessionName], { cwd: root, encoding: 'utf8', timeout: 5000 });
  const parsed = parseJson(run.stdout);
  const ledgerRoot = parsed?.ledger_root ? path.join(root, parsed.ledger_root) : null;
  const runtimeProof = ledgerRoot ? await inspectRealLedger(ledgerRoot) : null;
  const blockers = [
    ...(sourceOk ? [] : ['agent_real_codex_in_zellij_worker_pane_source_check_failed']),
    ...(eventProof.ok ? [] : ['agent_real_codex_in_zellij_worker_pane_static_event_order_failed']),
    ...(run.status === 0 ? [] : [`real_codex_zellij_worker_pane_command_exit_${run.status}`]),
    ...(parsed ? [] : ['real_codex_zellij_worker_pane_json_missing']),
    ...(runtimeProof?.blockers || [])
  ];
  const report = {
    schema: 'sks.agent-real-codex-in-zellij-worker-pane-check.v1',
    ok: blockers.length === 0,
    integration_optional: false,
    mission_id: parsed?.mission_id || missionId,
    session_name: sessionName,
    source_ok: sourceOk,
    event_proof: eventProof,
    command: [process.execPath, ...command],
    exit_code: run.status,
    signal: run.signal,
    timed_out: run.error?.code === 'ETIMEDOUT',
    stdout_tail: tail(run.stdout),
    stderr_tail: tail(run.stderr),
    real_execution: runtimeProof,
    blockers
  };
  await emit(report);
}

async function inspectRealLedger(ledgerRoot) {
  const swarm = await readJson(path.join(ledgerRoot, 'agent-native-cli-session-swarm.json'), null);
  const records = Array.isArray(swarm?.records) ? swarm.records : [];
  const workerRecords = records.filter((row) => row.scaling_primitive === 'native_cli_process_in_zellij_worker_pane');
  const eventsByWorker = [];
  for (const record of workerRecords) {
    const workerDir = String(record.worker_artifact_dir || '');
    const events = await readJsonl(path.join(ledgerRoot, workerDir, 'zellij-worker-pane-events.jsonl'));
    eventsByWorker.push({ worker_dir: workerDir, event_proof: manager.evaluateZellijWorkerPaneSpawnOrder(events), events });
  }
  const bindingProof = await slotPaneProof.writeAgentSlotPaneBindingProof(ledgerRoot, {
    requireZellij: true,
    reportPath: path.join(root, '.sneakoscope', 'reports', 'agent-real-codex-in-zellij-worker-pane-binding-proof.json')
  });
  const blockers = [
    ...(swarm?.ok === true ? [] : ['real_codex_zellij_swarm_not_ok']),
    ...(workerRecords.length >= 1 ? [] : ['real_codex_zellij_worker_record_missing']),
    ...(workerRecords.some((row) => row.pane_kind === 'worker_codex_sdk') ? [] : ['real_codex_zellij_worker_pane_kind_missing']),
    ...(workerRecords.every((row) => manager.isRealZellijWorkerPaneIdSource(row.zellij_pane_id_source)) ? [] : ['real_codex_zellij_pane_id_source_not_real']),
    ...(workerRecords.every((row) => row.zellij_pane_id) ? [] : ['real_codex_zellij_pane_id_missing']),
    ...(workerRecords.every((row) => row.sdk_thread_id) ? [] : ['real_codex_zellij_sdk_thread_missing']),
    ...(workerRecords.every((row) => Number(row.stream_event_count || 0) > 0) ? [] : ['real_codex_zellij_sdk_stream_events_missing']),
    ...(workerRecords.every((row) => row.structured_output_valid === true) ? [] : ['real_codex_zellij_structured_output_missing']),
    ...(eventsByWorker.every((row) => row.event_proof.ok === true) ? [] : ['real_codex_zellij_event_order_failed']),
    ...(bindingProof.ok === true ? [] : ['real_codex_zellij_slot_pane_binding_failed', ...(bindingProof.blockers || [])])
  ];
  return {
    ledger_root: ledgerRoot,
    swarm_ok: swarm?.ok === true,
    zellij_pane_worker_sessions: Number(swarm?.zellij_pane_worker_sessions || 0),
    closed_worker_process_count: Number(swarm?.closed_worker_process_count || 0),
    worker_record_count: records.length,
    zellij_worker_record_count: workerRecords.length,
    worker_records: workerRecords.map((row) => ({
      session_id: row.session_id,
      slot_id: row.slot_id,
      generation_index: row.generation_index,
      pane_kind: row.pane_kind,
      zellij_pane_id: row.zellij_pane_id,
      zellij_pane_id_source: row.zellij_pane_id_source,
      sdk_thread_id: row.sdk_thread_id,
      stream_event_count: row.stream_event_count,
      structured_output_valid: row.structured_output_valid,
      status: row.status,
      blockers: row.blockers || []
    })),
    event_proofs: eventsByWorker.map((row) => ({ worker_dir: row.worker_dir, event_proof: row.event_proof })),
    binding_proof: bindingProof,
    blockers
  };
}

async function emit(report) {
  await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'agent-real-codex-in-zellij-worker-pane.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function fail(blocker, detail) { emit({ schema: 'sks.agent-real-codex-in-zellij-worker-pane-check.v1', ok: false, blockers: [blocker], detail }).then(() => process.exit(1)); }

function parseJson(stdout) {
  const text = String(stdout || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readJsonl(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { parse_error: true, raw: line };
      }
    });
  } catch {
    return [];
  }
}

function tail(value, limit = 4000) {
  const text = String(value || '');
  return text.length > limit ? text.slice(-limit) : text;
}

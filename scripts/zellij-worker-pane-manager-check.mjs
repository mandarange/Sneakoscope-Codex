#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const manager = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-worker-pane-manager.js')).href);
const source = await fs.readFile(path.join(root, 'src', 'core', 'zellij', 'zellij-worker-pane-manager.ts'), 'utf8');
const artifact = manager.buildWorkerPaneArtifact({
  root,
  missionId: 'M-worker-pane-manager',
  sessionName: 'sks-M-worker-pane-manager',
  slotId: 'slot-001',
  generationIndex: 7,
  sessionId: 'slot-001-gen-7',
  workerArtifactDir: 'sessions/slot-001/gen-7/worker',
  resultPath: 'sessions/slot-001/gen-7/worker/worker-result.json',
  heartbeatPath: 'sessions/slot-001/gen-7/worker/worker-heartbeat.jsonl',
  patchEnvelopePath: 'sessions/slot-001/gen-7/worker/worker-patch-envelope.json',
  stdoutLog: 'sessions/slot-001/gen-7/worker/worker.stdout.log',
  stderrLog: 'sessions/slot-001/gen-7/worker/worker.stderr.log',
  paneId: '42',
  paneIdSource: 'zellij_worker_new_pane_stdout',
  sdkThreadId: 'sdk-thread-7',
  sdkRunId: 'sdk-run-7',
  streamEventCount: 4,
  structuredOutputValid: true,
  status: 'running',
  blockers: []
});
const spawnOrder = manager.evaluateZellijWorkerPaneSpawnOrder([
  { event_type: 'session_launch_started' },
  { event_type: 'zellij_worker_pane_created' },
  { event_type: 'worker_started' },
  { event_type: 'codex_sdk_thread_started' },
  { event_type: 'result_written' },
  { event_type: 'pane_closed' }
]);
const syntheticRejected = !manager.isRealZellijWorkerPaneIdSource('synthetic_layout_pending_proof')
  && !manager.isRealZellijWorkerPaneIdSource('zellij_worker_pane_stdout_missing');
const sourceOk = source.includes("action', 'new-pane'")
  && source.includes("'--name', paneName")
  && source.includes("'--', 'sh', '-lc'")
  && source.includes('zellij_worker_new_pane_stdout')
  && source.includes('zellij_worker_list_panes')
  && !source.includes('zellij-pane-${slotId}');
const ok = artifact.ok
  && artifact.pane_name === 'slot-001/gen-7'
  && artifact.pane_kind === 'worker_codex_sdk'
  && artifact.sdk_thread_id === 'sdk-thread-7'
  && artifact.stream_event_count === 4
  && artifact.scaling_primitive === 'native_cli_process_in_zellij_worker_pane'
  && syntheticRejected
  && spawnOrder.ok
  && sourceOk;
emit({
  schema: 'sks.zellij-worker-pane-manager-check.v1',
  ok,
  artifact,
  synthetic_rejected: syntheticRejected,
  spawn_order: spawnOrder,
  source_ok: sourceOk,
  blockers: ok ? [] : ['zellij_worker_pane_manager_contract_failed']
});

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-worker-pane-manager-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }

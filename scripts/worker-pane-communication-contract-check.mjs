#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const contract = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'worker-pane-communication-contract.js')).href);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-worker-pane-contract-'));
const workerDir = path.join('sessions', 'slot-001', 'gen-1', 'worker');
await fs.mkdir(path.join(tmp, workerDir), { recursive: true });
await fs.writeFile(path.join(tmp, 'agent-native-cli-session-swarm.json'), `${JSON.stringify({
  records: [{
    session_id: 'slot-001-gen-1',
    slot_id: 'slot-001',
    generation_index: 1,
    worker_artifact_dir: workerDir,
    worker_intake: path.join(workerDir, 'worker-intake.json'),
    result_path: path.join(workerDir, 'worker-result.json'),
    heartbeat_path: path.join(workerDir, 'worker-heartbeat.jsonl'),
    patch_envelope_path: path.join(workerDir, 'worker-patch-envelope.json'),
    scaling_primitive: 'native_cli_process_in_zellij_worker_pane'
  }]
}, null, 2)}\n`);
await fs.writeFile(path.join(tmp, workerDir, 'worker-intake.json'), '{"ok":true}\n');
await fs.writeFile(path.join(tmp, workerDir, 'worker-result.json'), '{"status":"done"}\n');
await fs.writeFile(path.join(tmp, workerDir, 'worker-heartbeat.jsonl'), '{"event":"started"}\n');
await fs.writeFile(path.join(tmp, workerDir, 'worker-process-report.json'), '{"pid":1234}\n');
await fs.writeFile(path.join(tmp, workerDir, 'worker-no-patch-reason.json'), '{"ok":true}\n');
await fs.writeFile(path.join(tmp, workerDir, 'zellij-worker-pane.json'), `${JSON.stringify({
  schema: 'sks.zellij-worker-pane.v1',
  pane_id: '9',
  parent_child_transport: 'worker-result-json-and-heartbeat'
})}\n`);
const report = await contract.writeWorkerPaneCommunicationContract(tmp, { requireZellij: true, reportPath: path.join(root, '.sneakoscope', 'reports', 'worker-pane-communication-contract.json') });
const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-worker-pane-contract-bad-'));
await fs.writeFile(path.join(badRoot, 'agent-native-cli-session-swarm.json'), '{"records":[{"worker_artifact_dir":"worker","scaling_primitive":"native_cli_process_in_zellij_worker_pane"}]}\n');
const bad = await contract.evaluateWorkerPaneCommunicationContract(badRoot, { requireZellij: true });
const ok = report.ok && bad.ok === false && bad.blockers.includes('worker_pane_contract_result_missing');
emit({ schema: 'sks.worker-pane-communication-contract-check.v1', ok, report, bad, blockers: ok ? [] : ['worker_pane_communication_contract_check_failed'] });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.worker-pane-communication-contract-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }

#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { writeWorkerPaneCommunicationContract, evaluateWorkerPaneCommunicationContract } from '../core/agents/worker-pane-communication-contract.js'
import { packageRoot } from '../core/fsx.js'

const root = packageRoot()
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-worker-pane-contract-'))
const workerDir = path.join('sessions', 'slot-001', 'gen-1', 'worker')
await fs.mkdir(path.join(tmp, workerDir), { recursive: true })
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
}, null, 2)}\n`)
await fs.writeFile(path.join(tmp, workerDir, 'worker-intake.json'), '{"ok":true}\n')
await fs.writeFile(path.join(tmp, workerDir, 'worker-result.json'), '{"status":"done"}\n')
await fs.writeFile(path.join(tmp, workerDir, 'worker-heartbeat.jsonl'), '{"event":"started"}\n')
await fs.writeFile(path.join(tmp, workerDir, 'worker-process-report.json'), '{"pid":1234}\n')
await fs.writeFile(path.join(tmp, workerDir, 'codex-control-proof.json'), '{"ok":true,"sdk_thread_id":"sdk-thread-1"}\n')
await fs.writeFile(path.join(tmp, workerDir, 'worker-no-patch-reason.json'), '{"ok":true}\n')
await fs.writeFile(path.join(tmp, workerDir, 'zellij-worker-pane-events.jsonl'), [
  '{"event_type":"session_launch_started"}',
  '{"event_type":"zellij_worker_pane_created"}',
  '{"event_type":"worker_started"}',
  '{"event_type":"codex_sdk_thread_started"}',
  '{"event_type":"result_written"}',
  '{"event_type":"pane_closed"}'
].join('\n') + '\n')
await fs.writeFile(path.join(tmp, workerDir, 'zellij-worker-pane.json'), `${JSON.stringify({
  schema: 'sks.zellij-worker-pane.v1',
  pane_id: '9',
  parent_child_transport: 'worker-result-json-and-heartbeat'
})}\n`)
const report = await writeWorkerPaneCommunicationContract(tmp, { requireZellij: true, reportPath: path.join(root, '.sneakoscope', 'reports', 'worker-pane-communication-contract.json') })
const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-worker-pane-contract-bad-'))
await fs.writeFile(path.join(badRoot, 'agent-native-cli-session-swarm.json'), '{"records":[{"worker_artifact_dir":"worker","scaling_primitive":"native_cli_process_in_zellij_worker_pane"}]}\n')
const bad = await evaluateWorkerPaneCommunicationContract(badRoot, { requireZellij: true })
const ok = report.ok && bad.ok === false && bad.blockers.includes('worker_pane_contract_result_missing') && bad.blockers.includes('worker_pane_contract_codex_control_proof_missing')
emit({ schema: 'sks.worker-pane-communication-contract-check.v1', ok, report, bad, blockers: ok ? [] : ['worker_pane_communication_contract_check_failed'] })

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

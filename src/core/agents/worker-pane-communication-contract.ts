import fs from 'node:fs/promises'
import path from 'node:path'
import { exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const WORKER_PANE_COMMUNICATION_CONTRACT_SCHEMA = 'sks.worker-pane-communication-contract.v1'

export async function writeWorkerPaneCommunicationContract(root: string, input: { reportPath?: string; requireZellij?: boolean } = {}) {
  const report = await evaluateWorkerPaneCommunicationContract(root, input)
  const reportPath = input.reportPath || path.join(root, '.sneakoscope', 'reports', 'worker-pane-communication-contract.json')
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await writeJsonAtomic(reportPath, report)
  return report
}

export async function evaluateWorkerPaneCommunicationContract(root: string, input: { requireZellij?: boolean } = {}) {
  const summary = await readJson<any>(path.join(root, 'agent-native-cli-session-swarm.json'), null)
  const records = Array.isArray(summary?.records)
    ? summary.records.filter((record: any) => record.scaling_primitive === 'native_cli_process_in_zellij_worker_pane')
    : []
  const checks = await Promise.all(records.map((record: any) => checkRecord(root, record)))
  const blockers = [
    ...(input.requireZellij && !records.length ? ['worker_pane_contract_zellij_records_missing'] : []),
    ...checks.flatMap((check) => check.blockers)
  ]
  return {
    schema: WORKER_PANE_COMMUNICATION_CONTRACT_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    integration_optional: input.requireZellij !== true,
    checked_worker_panes: checks.length,
    checks,
    blockers
  }
}

async function checkRecord(root: string, record: any) {
  const workerDir = String(record.worker_artifact_dir || '')
  const resultPath = path.join(root, String(record.result_path || path.join(workerDir, 'worker-result.json')))
  const heartbeatPath = path.join(root, String(record.heartbeat_path || path.join(workerDir, 'worker-heartbeat.jsonl')))
  const intakePath = path.join(root, String(record.worker_intake || path.join(workerDir, 'worker-intake.json')))
  const processReportPath = path.join(root, workerDir, 'worker-process-report.json')
  const panePath = path.join(root, workerDir, 'zellij-worker-pane.json')
  const heartbeatText = await readText(heartbeatPath)
  const result = await readJson<any>(resultPath, null)
  const processReport = await readJson<any>(processReportPath, null)
  const pane = await readJson<any>(panePath, null)
  const patchPath = record.patch_envelope_path ? path.join(root, String(record.patch_envelope_path)) : path.join(root, workerDir, 'worker-patch-envelope.json')
  const noPatchPath = path.join(root, workerDir, 'worker-no-patch-reason.json')
  const intakeExists = await exists(intakePath)
  const patchOrNoPatchExists = await exists(patchPath) || await exists(noPatchPath)
  const blockers = [
    ...(!intakeExists ? ['worker_pane_contract_intake_missing'] : []),
    ...(!result ? ['worker_pane_contract_result_missing'] : []),
    ...(!heartbeatText.trim() ? ['worker_pane_contract_heartbeat_missing'] : []),
    ...(!processReport ? ['worker_pane_contract_process_report_missing'] : []),
    ...(!pane ? ['worker_pane_contract_pane_artifact_missing'] : []),
    ...(!patchOrNoPatchExists ? ['worker_pane_contract_patch_or_no_patch_missing'] : []),
    ...(pane && pane.parent_child_transport !== 'worker-result-json-and-heartbeat' ? ['worker_pane_contract_transport_mismatch'] : [])
  ]
  return {
    session_id: record.session_id || null,
    slot_id: record.slot_id || null,
    generation_index: record.generation_index || null,
    worker_artifact_dir: workerDir,
    result_path: resultPath,
    heartbeat_path: heartbeatPath,
    process_report_path: processReportPath,
    pane_path: panePath,
    result_status: result?.status || null,
    heartbeat_lines: heartbeatText.trim() ? heartbeatText.trim().split(/\r?\n/).length : 0,
    worker_process_id: processReport?.pid || null,
    pane_id: pane?.pane_id || null,
    blockers
  }
}

async function readText(file: string) {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return ''
  }
}

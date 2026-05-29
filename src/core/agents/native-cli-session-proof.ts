import fs from 'node:fs/promises'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const NATIVE_CLI_SESSION_PROOF_SCHEMA = 'sks.native-cli-session-proof.v1'

export async function writeNativeCliSessionProof(root: string, input: { requestedAgents?: number; targetActiveSlots?: number; totalWorkItems?: number } = {}) {
  const swarm = await readJson<any>(path.join(root, 'agent-native-cli-session-swarm.json'), null)
  const scheduler = await readJson<any>(path.join(root, 'agent-scheduler-state.json'), null)
  const workerProcessReports = await collectNamedJson(root, 'worker-process-report.json')
  const workerCloseReports = await collectNamedJson(root, 'worker-terminal-close-report.json')
  const workerHeartbeats = await collectHeartbeatCounts(root)
  const requestedAgents = Number(input.requestedAgents || swarm?.requested_agents || scheduler?.target_active_slots || 0)
  const targetActiveSlots = Number(input.targetActiveSlots || swarm?.target_active_slots || scheduler?.target_active_slots || requestedAgents)
  const totalWorkItems = Number(input.totalWorkItems || scheduler?.total_work_items || 0)
  const enoughWork = totalWorkItems >= requestedAgents && requestedAgents > 0
  const spawnedWorkerProcessCount = Number(swarm?.spawned_worker_process_count || 0)
  const maxObservedWorkerProcessCount = Number(swarm?.max_observed_worker_process_count || 0)
  const processIds = Array.isArray(swarm?.process_ids) ? swarm.process_ids.filter((pid: any) => Number.isFinite(Number(pid))) : []
  const blockers = [
    ...(!swarm ? ['native_cli_session_swarm_missing'] : []),
    ...(swarm && swarm.scaling_primitive !== 'native_cli_process' ? ['scaling_primitive_not_native_cli_process'] : []),
    ...(swarm && processIds.length < spawnedWorkerProcessCount ? ['worker_process_ids_missing'] : []),
    ...(swarm && spawnedWorkerProcessCount === 0 ? ['native_worker_process_count_zero'] : []),
    ...(enoughWork && requestedAgents >= 10 && spawnedWorkerProcessCount < requestedAgents ? [`native_worker_process_count_below_requested:${requestedAgents}`] : []),
    ...(enoughWork && targetActiveSlots >= 10 && spawnedWorkerProcessCount < targetActiveSlots ? [`native_worker_process_count_below_target:${targetActiveSlots}`] : []),
    ...(workerProcessReports.length < spawnedWorkerProcessCount ? ['worker_process_report_count_below_spawned'] : []),
    ...(workerCloseReports.length < spawnedWorkerProcessCount ? ['worker_close_report_count_below_spawned'] : []),
    ...(workerHeartbeats.total_worker_heartbeat_files < spawnedWorkerProcessCount ? ['worker_heartbeat_count_below_spawned'] : []),
    ...(swarm && Number(swarm.unique_worker_session_count || 0) < spawnedWorkerProcessCount ? ['worker_session_ids_not_unique'] : []),
    ...(swarm && Number(swarm.unique_slot_count || 0) < Math.min(spawnedWorkerProcessCount, targetActiveSlots || 0) ? ['worker_slot_ids_not_unique_for_target'] : []),
    ...(swarm && Number(swarm.closed_worker_process_count || 0) < spawnedWorkerProcessCount ? ['worker_close_reports_missing_or_failed'] : []),
    ...(swarm && spawnedWorkerProcessCount === 0 && hasSubagentEvidenceOnly(root) ? ['worker_proof_only_subagent_events'] : [])
  ]
  const proof = {
    schema: NATIVE_CLI_SESSION_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    requested_agents: requestedAgents,
    target_active_slots: targetActiveSlots,
    enough_work_for_requested_agents: enoughWork,
    total_work_items: totalWorkItems,
    spawned_worker_process_count: spawnedWorkerProcessCount,
    max_observed_worker_process_count: maxObservedWorkerProcessCount,
    unique_worker_session_count: Number(swarm?.unique_worker_session_count || 0),
    unique_slot_count: Number(swarm?.unique_slot_count || 0),
    unique_generation_count: Number(swarm?.unique_generation_count || 0),
    process_ids: processIds,
    worker_command_lines: swarm?.worker_command_lines || [],
    heartbeat_count_by_worker: workerHeartbeats.count_by_worker,
    close_report_count: workerCloseReports.length,
    worker_exit_codes: workerCloseReports.map((row) => row.json?.exit_code ?? null),
    worker_artifact_dirs: swarm?.worker_artifact_dirs || [],
    worker_process_report_count: workerProcessReports.length,
    worker_proof_is_only_subagent_events: blockers.includes('worker_proof_only_subagent_events'),
    artifact: 'native-cli-session-proof.json',
    swarm_artifact: 'agent-native-cli-session-swarm.json',
    blockers
  }
  await writeJsonAtomic(path.join(root, 'native-cli-session-proof.json'), proof)
  return proof
}

async function collectNamedJson(root: string, filename: string) {
  const out: Array<{ relative_path: string; json: any }> = []
  await walk(root, async (file) => {
    if (path.basename(file) !== filename) return
    const json = await readJson<any>(file, null).catch(() => null)
    if (json) out.push({ relative_path: path.relative(root, file), json })
  })
  return out
}

async function collectHeartbeatCounts(root: string) {
  const countByWorker: Record<string, number> = {}
  await walk(root, async (file) => {
    if (path.basename(file) !== 'worker-heartbeat.jsonl') return
    const text = await fs.readFile(file, 'utf8').catch(() => '')
    countByWorker[path.relative(root, path.dirname(file))] = text.split(/\n/).filter(Boolean).length
  })
  return {
    total_worker_heartbeat_files: Object.keys(countByWorker).length,
    count_by_worker: countByWorker
  }
}

function hasSubagentEvidenceOnly(_root: string) {
  return false
}

async function walk(dir: string, visit: (file: string) => Promise<void>) {
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, visit)
    else await visit(full)
  }
}

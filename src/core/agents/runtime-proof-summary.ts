import path from 'node:path'
import { findLatestMission, missionDir } from '../mission.js'
import { readJson, writeJsonAtomic } from '../fsx.js'
import { readAgentMessageBus, type AgentMessageBusEntry } from './agent-message-bus.js'

export const RUNTIME_PROOF_SUMMARY_SCHEMA = 'sks.runtime-proof-summary.v1'

export interface RuntimeProofSummary {
  schema: typeof RUNTIME_PROOF_SUMMARY_SCHEMA
  ok: boolean
  mission_id: string
  generated_at: string
  parallel: {
    max_active_workers: number
    unique_worker_pids: number
    speedup_ratio: number
    proof_passed: boolean
  }
  ui: {
    visible_panes: number
    headless_workers: number
    telemetry_age_ms: number
    stale: boolean
  }
  model_calls: {
    max_observed: number
    unique_model_call_ids: number
  }
  scheduler: {
    largest_batch_size: number
    utilization: number
  }
  messages: {
    recent: AgentMessageBusEntry[]
    completed_count: number
    failed_count: number
    warning_count: number
    error_count: number
  }
  blockers: string[]
}

export async function buildRuntimeProofSummary(root: string, missionIdInput: string = 'latest', opts: { maxMessages?: number } = {}): Promise<RuntimeProofSummary> {
  const missionId = missionIdInput === 'latest' ? await findLatestMission(root) : missionIdInput
  if (!missionId) throw new Error('runtime_proof_summary_mission_missing')
  const dir = missionDir(root, missionId)
  const agentsDir = path.join(dir, 'agents')
  const parallel = await readJson<any>(path.join(agentsDir, 'parallel-runtime-proof.json'), null)
  const scheduler = await readJson<any>(path.join(agentsDir, 'agent-scheduler-state.json'), null)
  const swarm = await readJson<any>(path.join(agentsDir, 'agent-native-cli-session-swarm.json'), null)
  const telemetry = await readJson<any>(path.join(dir, 'zellij', 'slot-telemetry.snapshot.json'), null)
  const governor = await readJson<any>(path.join(agentsDir, 'naruto-concurrency-governor.json'), null)
  const messagesAll = await readAgentMessageBus(root, missionId, { max: 500 })
  const recentMessages = await readAgentMessageBus(root, missionId, { max: opts.maxMessages || 8 })
  const failedMessages = messagesAll.filter((row) => row.event_type === 'worker_failed')
  const errorMessages = messagesAll.filter((row) => row.level === 'error')
  const telemetryAgeMs = telemetry?.updated_at ? Math.max(0, Date.now() - Date.parse(telemetry.updated_at)) : Number.MAX_SAFE_INTEGER
  const visiblePanes = Number(parallel?.visible_panes ?? swarm?.zellij_pane_worker_sessions ?? telemetryVisiblePaneCount(telemetry) ?? 0)
  const targetActive = Number(scheduler?.target_active_slots ?? parallel?.target_active_slots ?? swarm?.target_active_slots ?? governor?.target_active_slots ?? 0)
  const headlessWorkers = Number(parallel?.headless_workers ?? swarm?.headless_overflow_worker_count ?? Math.max(0, targetActive - visiblePanes))
  const blockers = [
    ...(!parallel ? ['parallel_runtime_proof_missing'] : []),
    ...(!scheduler ? ['agent_scheduler_state_missing'] : []),
    ...(parallel?.passed === false ? parallel.blockers || ['parallel_runtime_proof_failed'] : []),
    ...(errorMessages.length ? ['agent_message_bus_error_blockers'] : []),
    ...(telemetryAgeMs > 3000 ? ['zellij_telemetry_stale'] : [])
  ].map(String)
  const summary: RuntimeProofSummary = {
    schema: RUNTIME_PROOF_SUMMARY_SCHEMA,
    ok: blockers.length === 0,
    mission_id: missionId,
    generated_at: new Date().toISOString(),
    parallel: {
      max_active_workers: Number(parallel?.max_observed_active_workers || scheduler?.max_observed_active_slots || 0),
      unique_worker_pids: Number(parallel?.unique_worker_pids || uniqueNumbers(swarm?.process_ids).length || 0),
      speedup_ratio: Number(parallel?.speedup_ratio || 0),
      proof_passed: parallel?.passed === true
    },
    ui: {
      visible_panes: visiblePanes,
      headless_workers: headlessWorkers,
      telemetry_age_ms: telemetryAgeMs,
      stale: telemetryAgeMs > 3000
    },
    model_calls: {
      max_observed: Number(parallel?.max_observed_model_calls || 0),
      unique_model_call_ids: Number(parallel?.unique_model_call_ids || 0)
    },
    scheduler: {
      largest_batch_size: Number(scheduler?.largest_batch_size || 0),
      utilization: Number(scheduler?.scheduler_utilization || 0)
    },
    messages: {
      recent: recentMessages,
      completed_count: messagesAll.filter((row) => row.event_type === 'worker_completed').length,
      failed_count: failedMessages.length,
      warning_count: messagesAll.filter((row) => row.level === 'warning').length,
      error_count: errorMessages.length
    },
    blockers
  }
  await writeJsonAtomic(path.join(agentsDir, 'runtime-proof-summary.json'), summary)
  return summary
}

export function renderRuntimeProofSummary(summary: RuntimeProofSummary): string {
  return [
    `Parallel proof: ${summary.parallel.proof_passed ? 'passed' : 'blocked'}`,
    `Active workers: ${summary.parallel.max_active_workers}`,
    `Unique PIDs: ${summary.parallel.unique_worker_pids}`,
    `Speedup: ${summary.parallel.speedup_ratio}x`,
    `Visible/headless: ${summary.ui.visible_panes} / ${summary.ui.headless_workers}`,
    `Telemetry: ${summary.ui.stale ? `stale ${(summary.ui.telemetry_age_ms / 1000).toFixed(1)}s` : `fresh ${(summary.ui.telemetry_age_ms / 1000).toFixed(1)}s`}`,
    `Model calls max: ${summary.model_calls.max_observed}`,
    ...(summary.messages.recent.length ? [
      'Recent worker messages:',
      ...summary.messages.recent.map((row) => `  ${messageStatusLabel(row)} ${row.slot_id || row.worker_id}: ${row.message}`)
    ] : []),
    ...(summary.blockers.length ? [`Blockers: ${summary.blockers.join(', ')}`] : [])
  ].join('\n')
}

function messageStatusLabel(row: AgentMessageBusEntry): string {
  if (row.event_type === 'worker_completed') return '[done]'
  if (row.event_type === 'worker_failed') return '[fail]'
  if (row.level === 'warning') return '[warn]'
  if (row.level === 'error') return '[err]'
  return '[info]'
}

function telemetryVisiblePaneCount(snapshot: any) {
  const slots = snapshot?.slots && typeof snapshot.slots === 'object' ? Object.values(snapshot.slots) : []
  return slots.filter((row: any) => row?.status && row.status !== 'headless').length
}

function uniqueNumbers(values: unknown) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value)))]
}

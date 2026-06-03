import fs from 'node:fs/promises'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { isRealZellijWorkerPaneIdSource } from '../zellij/zellij-worker-pane-manager.js'

export const AGENT_SLOT_PANE_BINDING_PROOF_SCHEMA = 'sks.agent-slot-pane-binding-proof.v1'

export async function writeAgentSlotPaneBindingProof(root: string, input: { reportPath?: string; requireZellij?: boolean } = {}) {
  const report = await evaluateAgentSlotPaneBindingProof(root, input)
  const reportPath = input.reportPath || path.join(root, '.sneakoscope', 'reports', 'agent-slot-pane-binding-proof.json')
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await writeJsonAtomic(reportPath, report)
  return report
}

export async function evaluateAgentSlotPaneBindingProof(root: string, input: { requireZellij?: boolean } = {}) {
  const summary = await readJson<any>(path.join(root, 'agent-native-cli-session-swarm.json'), null)
  const ledger = await readJsonl(path.join(root, 'agent-zellij-pane-launch-ledger.jsonl'))
  const zellijRecords = Array.isArray(summary?.records)
    ? summary.records.filter((record: any) => record.scaling_primitive === 'native_cli_process_in_zellij_worker_pane')
    : []
  const paneLedgers = ledger.filter((row: any) => row.scaling_primitive === 'native_cli_process_in_zellij_worker_pane' || row.pane_kind === 'worker_codex_sdk')
  const uniqueKeys = new Set<string>()
  const duplicates: string[] = []
  for (const row of zellijRecords) {
    const key = `${row.slot_id}:${row.generation_index}`
    if (uniqueKeys.has(key)) duplicates.push(key)
    uniqueKeys.add(key)
  }
  const closedCount = Number(summary?.closed_worker_process_count || 0)
  const zellijPaneWorkerSessions = Number(summary?.zellij_pane_worker_sessions || 0)
  const blockers = [
    ...(input.requireZellij && !zellijRecords.length ? ['slot_pane_binding_zellij_records_missing'] : []),
    ...(zellijRecords.some((record: any) => record.pane_kind !== 'worker_codex_sdk') ? ['slot_pane_binding_wrong_pane_kind'] : []),
    ...(zellijRecords.some((record: any) => !isRealZellijWorkerPaneIdSource(record.zellij_pane_id_source)) ? ['slot_pane_binding_synthetic_or_missing_pane_id_source'] : []),
    ...(zellijRecords.some((record: any) => !record.zellij_pane_id) ? ['slot_pane_binding_pane_id_missing'] : []),
    ...(zellijRecords.some((record: any) => !record.sdk_thread_id) ? ['slot_pane_binding_sdk_thread_id_missing'] : []),
    ...(zellijRecords.some((record: any) => Number(record.stream_event_count || 0) < 1) ? ['slot_pane_binding_sdk_stream_events_missing'] : []),
    ...(zellijRecords.some((record: any) => record.structured_output_valid !== true) ? ['slot_pane_binding_structured_output_missing'] : []),
    ...(duplicates.length ? ['slot_pane_binding_duplicate_slot_generation'] : []),
    ...(zellijPaneWorkerSessions > 0 && zellijPaneWorkerSessions !== closedCount ? ['slot_pane_binding_zellij_session_close_count_mismatch'] : []),
    ...(paneLedgers.some((row: any) => row.persistent_slot_lane === true) ? ['slot_pane_binding_persistent_slot_lane_present'] : [])
  ]
  return {
    schema: AGENT_SLOT_PANE_BINDING_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    integration_optional: input.requireZellij !== true,
    zellij_pane_worker_sessions: zellijPaneWorkerSessions,
    closed_worker_process_count: closedCount,
    worker_record_count: Array.isArray(summary?.records) ? summary.records.length : 0,
    zellij_worker_record_count: zellijRecords.length,
    pane_ledger_count: paneLedgers.length,
    sdk_thread_count: new Set(zellijRecords.map((record: any) => record.sdk_thread_id).filter(Boolean)).size,
    unique_slot_generation_count: uniqueKeys.size,
    duplicate_slot_generations: duplicates,
    max_observed_worker_process_count: Number(summary?.max_observed_worker_process_count || 0),
    target_active_slots: Number(summary?.target_active_slots || 0),
    blockers
  }
}

export function evaluateWorkerPaneBackfillProof(records: any[], targetActiveSlots: number, workItems: number) {
  const generationKeys = records.map((record) => `${record.slot_id}:${record.generation_index}`).filter(Boolean)
  const paneNames = records.map((record) => record.pane_name || `${record.slot_id}/gen-${record.generation_index}`).filter(Boolean)
  const blockers = [
    ...(records.length < workItems ? ['dynamic_backfill_generation_records_missing'] : []),
    ...(new Set(generationKeys).size < workItems ? ['dynamic_backfill_distinct_generation_records_missing'] : []),
    ...(new Set(paneNames).size < workItems ? ['dynamic_backfill_distinct_pane_records_missing'] : []),
    ...(records.some((record) => Number(record.active_at_once || targetActiveSlots) > targetActiveSlots) ? ['dynamic_backfill_exceeded_target_active_slots'] : [])
  ]
  return {
    schema: 'sks.agent-zellij-dynamic-backfill-pane-proof.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    target_active_slots: targetActiveSlots,
    work_items: workItems,
    generation_record_count: records.length,
    distinct_generation_count: new Set(generationKeys).size,
    distinct_pane_count: new Set(paneNames).size,
    blockers
  }
}

async function readJsonl(file: string) {
  try {
    const text = await fs.readFile(file, 'utf8')
    return text.split(/\r?\n/).filter(Boolean).map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { parse_error: true, raw: line }
      }
    })
  } catch {
    return []
  }
}

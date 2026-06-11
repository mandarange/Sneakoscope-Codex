import fs from 'node:fs/promises'
import path from 'node:path'
import { readJson, readText, writeJsonAtomic } from '../fsx.js'

export interface ZellijWorkerPaneSummary {
  schema: 'sks.zellij-worker-pane-summary.v1'
  ok: boolean
  mission_id: string
  stacked_requested_count: number
  stacked_applied_count: number
  stacked_fallback_count: number
  fallback_modes: Record<string, number>
  pane_lock_wait_p95_ms: number
  pane_lock_held_p95_ms: number
  duplicate_slot_anchor_count: number
  blockers: string[]
}

export async function buildZellijWorkerPaneSummary(root: string, missionId: string): Promise<ZellijWorkerPaneSummary> {
  const missionDir = path.join(path.resolve(root), '.sneakoscope', 'missions', missionId)
  const ledgerRows = await readJsonl(path.join(path.resolve(root), 'agent-zellij-pane-launch-ledger.jsonl'))
  const missionRows = ledgerRows.filter((row) => !row.mission_id || row.mission_id === missionId)
  const state = await readJson<any>(path.join(missionDir, 'zellij-right-column-state.json'), null)
  const metrics = await readJsonl(path.join(missionDir, 'zellij', 'pane-creation-lock-events.jsonl'))
  const requested = missionRows.filter((row) => row.worker_stacked_requested === true)
  const applied = missionRows.filter((row) => row.worker_stacked_applied === true)
  const fallbackRows = missionRows.filter((row) => row.worker_stacked_requested === true && row.worker_stacked_applied !== true)
  const fallbackModes: Record<string, number> = {}
  for (const row of fallbackRows) {
    const mode = String(row.worker_stacked_fallback_mode || 'unknown')
    fallbackModes[mode] = (fallbackModes[mode] || 0) + 1
  }
  const anchors = new Set([
    ...missionRows.map((row) => row.slot_column_anchor_pane_id).filter(Boolean).map(String),
    ...(state?.slot_column_anchor_pane_id ? [String(state.slot_column_anchor_pane_id)] : [])
  ])
  const stackedCapable = missionRows.some((row) => row.worker_stacked_capability?.supports_stacked_panes === true)
  const waitP95 = percentile(metrics.map((row) => Number(row.wait_ms || 0)), 0.95)
  const heldP95 = percentile(metrics.map((row) => Number(row.held_ms || 0)), 0.95)
  const blockers = [
    ...(anchors.size > 1 ? ['zellij_duplicate_slot_anchor_count_gt_1'] : []),
    ...(requested.length > 0 && applied.length === 0 && stackedCapable ? ['zellij_stacked_requested_but_none_applied'] : []),
    ...(waitP95 > 5000 && requested.length <= 1 ? ['zellij_pane_lock_wait_high_with_low_concurrency'] : [])
  ]
  const summary: ZellijWorkerPaneSummary = {
    schema: 'sks.zellij-worker-pane-summary.v1',
    ok: blockers.length === 0,
    mission_id: missionId,
    stacked_requested_count: requested.length,
    stacked_applied_count: applied.length,
    stacked_fallback_count: fallbackRows.length,
    fallback_modes: fallbackModes,
    pane_lock_wait_p95_ms: waitP95,
    pane_lock_held_p95_ms: heldP95,
    duplicate_slot_anchor_count: anchors.size,
    blockers
  }
  await writeJsonAtomic(path.join(missionDir, 'zellij-worker-pane-summary.json'), summary)
  await writeJsonAtomic(path.join(path.resolve(root), '.sneakoscope', 'reports', 'zellij-worker-pane-summary.json'), summary)
  return summary
}

async function readJsonl(file: string): Promise<any[]> {
  const text = await readText(file, '').catch(() => '')
  return String(text || '').split(/\n+/).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
}

function percentile(values: number[], p: number): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
  return Math.round(sorted[index] || 0)
}

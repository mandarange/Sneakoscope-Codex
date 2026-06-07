#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { buildNarutoWorkGraph } from '../core/naruto/naruto-work-graph.js'
import { decideNarutoConcurrency } from '../core/naruto/naruto-concurrency-governor.js'
import { runNarutoRealActivePool } from '../core/naruto/naruto-active-pool.js'

const graph = buildNarutoWorkGraph({ requestedClones: 12, totalWorkItems: 24, writeCapable: true, maxActiveWorkers: 6 })
const governor = decideNarutoConcurrency({
  requestedClones: 12,
  totalWorkItems: graph.total_work_items,
  pendingWorkQueueSize: graph.total_work_items,
  backend: 'codex-sdk',
  hardware: { cpuCoreCount: 8, freeMemoryBytes: 32 * 1024 * 1024 * 1024, totalMemoryBytes: 64 * 1024 * 1024 * 1024, fileDescriptorLimit: 4096, processCount: 100, terminalRows: 40, remoteApiRateLimitBudget: 8 }
})
const target = { ...governor, safe_active_workers: Math.min(6, governor.safe_active_workers), safe_zellij_visible_panes: 3 }
let spawned = 0
let collected = 0
let dashboardEvents = 0
const report = await runNarutoRealActivePool({
  graph,
  governor: target,
  spawnWorker: async (item, placement) => {
    spawned += 1
    return { id: item.id, item, placement, started_at: Date.now() }
  },
  collectWorker: async (handle) => {
    collected += 1
    return { id: handle.id, ok: true, item: handle.item, placement: handle.placement, completed_at: Date.now() }
  },
  enqueueVerification: async () => undefined,
  updateDashboard: async () => {
    dashboardEvents += 1
  }
})
const processEvidence = report.worker_lifecycle.every((row) => row.pid == null || row.worker_artifact_dir != null)
const ok = report.ok && spawned === graph.total_work_items && collected === graph.total_work_items && report.max_observed_active_workers >= target.safe_active_workers && dashboardEvents > graph.total_work_items && report.active_cap === target.safe_active_workers && processEvidence
assertGate(ok, 'Naruto real active pool must run spawn/collect lifecycle and refill to cap', { report, spawned, collected, dashboardEvents, target })
emitGate('naruto:real-active-pool', { spawned, collected, active_cap: report.active_cap, max_observed_active_workers: report.max_observed_active_workers, refill_latency_ms_p95: report.refill_latency_ms_p95, active_pool_utilization: report.active_pool_utilization })

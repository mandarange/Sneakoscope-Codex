#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { buildNarutoWorkGraph } from '../core/naruto/naruto-work-graph.js'
import { decideNarutoConcurrency } from '../core/naruto/naruto-concurrency-governor.js'
import { runNarutoRealActivePool } from '../core/naruto/naruto-active-pool.js'
import { collectActualNarutoWorker, spawnActualNarutoWorker } from '../core/naruto/naruto-real-worker-runtime.js'

process.env.SKS_CODEX_SDK_FAKE = '1'

const graph = buildNarutoWorkGraph({ requestedClones: 100, totalWorkItems: 48, writeCapable: true, maxActiveWorkers: 12 })
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-naruto-extreme-real-'))
const missionId = `M-naruto-extreme-real-${process.pid}`
const governor = decideNarutoConcurrency({
  requestedClones: 100,
  totalWorkItems: graph.total_work_items,
  pendingWorkQueueSize: graph.total_work_items,
  backend: 'fake',
  hardware: { cores: 16, loadAverage: [1, 1, 1], freeMemoryBytes: 64 * 1024 * 1024 * 1024, totalMemoryBytes: 128 * 1024 * 1024 * 1024, fileDescriptorLimit: 8192, processCount: 100, terminalRows: 48, remoteApiRateLimitBudget: 32, localLlmMaxParallelRequests: 8 }
})
const target = { ...governor, safe_active_workers: Math.min(12, governor.safe_active_workers), safe_zellij_visible_panes: Math.min(4, governor.safe_zellij_visible_panes) }
const report = await runNarutoRealActivePool({
  graph,
  governor: target,
  spawnWorker: async (item, placement) => spawnActualNarutoWorker({
    root: tempRoot,
    missionId,
    item,
    placement,
    backend: 'fake',
    visiblePaneCap: target.safe_zellij_visible_panes,
    zellijSessionName: `sks-${missionId}`
  }),
  collectWorker: async (handle) => collectActualNarutoWorker(handle),
  enqueueVerification: async () => undefined,
  updateDashboard: async () => undefined
})
const actualArtifacts = report.worker_lifecycle.every((row) => row.pid && row.worker_artifact_dir && fs.existsSync(path.join(row.worker_artifact_dir, 'worker-result.json')))
const ok = report.ok && report.max_observed_active_workers >= Math.ceil(target.safe_active_workers * 0.8) && report.active_pool_utilization >= 0.8 && report.headless_workers > 0 && report.visible_workers <= graph.total_work_items && actualArtifacts
assertGate(ok, 'Naruto extreme parallelism must use actual child process active-pool lifecycle near cap with headless overflow', { report, target, actualArtifacts, tempRoot })
emitGate('naruto:extreme-parallelism-real', report)

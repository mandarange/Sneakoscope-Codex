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
const graph = buildNarutoWorkGraph({ requestedClones: 12, totalWorkItems: 24, writeCapable: false, maxActiveWorkers: 6 })
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-naruto-real-runtime-'))
const missionId = `M-naruto-real-runtime-${process.pid}`
const governor = decideNarutoConcurrency({
  requestedClones: 12,
  totalWorkItems: graph.total_work_items,
  pendingWorkQueueSize: graph.total_work_items,
  backend: 'codex-sdk',
  hardware: { cores: 8, freeMemoryBytes: 32 * 1024 * 1024 * 1024, totalMemoryBytes: 64 * 1024 * 1024 * 1024, fileDescriptorLimit: 4096, processCount: 100, terminalRows: 40, remoteApiRateLimitBudget: 8 }
})
let spawned = 0
let collected = 0
const target = { ...governor, safe_active_workers: Math.min(6, governor.safe_active_workers), safe_zellij_visible_panes: 3 }
const report = await runNarutoRealActivePool({
  graph,
  governor: target,
  spawnWorker: async (item, placement) => {
    spawned += 1
    return spawnActualNarutoWorker({
      root: tempRoot,
      missionId,
      item,
      placement,
      backend: 'fake',
      visiblePaneCap: target.safe_zellij_visible_panes,
      zellijSessionName: `sks-${missionId}`
    })
  },
  collectWorker: async (handle) => {
    collected += 1
    return collectActualNarutoWorker(handle)
  },
  enqueueVerification: async () => undefined,
  updateDashboard: async () => undefined
})
const processEvidence = report.worker_lifecycle.every((row) => row.pid && row.worker_artifact_dir)
const artifactEvidence = report.worker_lifecycle.every((row) => row.worker_artifact_dir
  && fs.existsSync(path.join(row.worker_artifact_dir, 'worker-heartbeat.jsonl'))
  && fs.existsSync(path.join(row.worker_artifact_dir, 'worker-result.json'))
  && fs.existsSync(path.join(row.worker_artifact_dir, 'codex-control', 'codex-control-proof.json')))
const ok = report.ok && spawned === graph.total_work_items && collected === graph.total_work_items && report.max_observed_active_workers >= target.safe_active_workers && report.active_pool_utilization >= 0.8 && processEvidence && artifactEvidence
assertGate(ok, 'Naruto real active pool runtime must include actual child process, heartbeat, and result evidence', { report, spawned, collected, processEvidence, artifactEvidence, tempRoot })
emitGate('naruto:real-active-pool-runtime', report)

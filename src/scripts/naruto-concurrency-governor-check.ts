#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const governorMod = await importDist('core/naruto/naruto-concurrency-governor.js')
const normal = governorMod.decideNarutoConcurrency({
  requestedClones: 200,
  totalWorkItems: 340,
  pendingWorkQueueSize: 340,
  backend: 'codex-sdk',
  zellijVisiblePaneCap: 12,
  hardware: {
    cores: 32,
    loadAverage: [0, 0, 0],
    freeMemoryBytes: 48 * 1024 * 1024 * 1024,
    totalMemoryBytes: 64 * 1024 * 1024 * 1024,
    fileDescriptorLimit: 4096,
    localLlmMaxParallelRequests: 4,
    remoteApiRateLimitBudget: 32,
    terminalRows: 40,
    terminalColumns: 140
  }
})
const pressure = governorMod.decideNarutoConcurrency({
  requestedClones: 200,
  totalWorkItems: 340,
  pendingWorkQueueSize: 340,
  backend: 'codex-sdk',
  zellijVisiblePaneCap: 12,
  hardware: {
    cores: 8,
    loadAverage: [16, 16, 16],
    freeMemoryBytes: 256 * 1024 * 1024,
    totalMemoryBytes: 4 * 1024 * 1024 * 1024,
    fileDescriptorLimit: 128,
    localLlmMaxParallelRequests: 4,
    remoteApiRateLimitBudget: 32,
    zellijPaneCount: 12,
    diskIoPressure: 0.9
  }
})

assertGate(
  normal.safe_active_workers >= 32 && normal.safe_active_workers <= 100,
  'requested_clones=200 fixture must cap active workers safely while allowing aggressive process-pool fanout',
  { normal }
)
assertGate(normal.safe_zellij_visible_panes === 12 && normal.headless_workers === normal.safe_active_workers - 12, 'zellij visible panes must stay within UI cap', { normal })
assertGate(normal.local_llm_parallel <= 4, 'local LLM active requests must respect max_parallel_requests=4', { normal })
assertGate(pressure.safe_active_workers < normal.safe_active_workers, 'memory/load pressure fixture must decrease active workers', { normal: normal.safe_active_workers, pressure: pressure.safe_active_workers })
assertGate(pressure.backpressure === 'saturated' || pressure.backpressure === 'throttled', 'pressure fixture must report backpressure', { pressure })

emitGate('naruto:concurrency-governor', {
  requested_clones: normal.requested_clones,
  total_work_items: normal.total_work_items,
  safe_active_workers: normal.safe_active_workers,
  safe_zellij_visible_panes: normal.safe_zellij_visible_panes,
  pressure_safe_active_workers: pressure.safe_active_workers
})

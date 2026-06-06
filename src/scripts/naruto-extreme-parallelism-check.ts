#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { buildNarutoWorkGraph } from '../core/naruto/naruto-work-graph.js'
import { decideNarutoConcurrency } from '../core/naruto/naruto-concurrency-governor.js'

const graph = buildNarutoWorkGraph({ requestedClones: 100, writeCapable: true, maxActiveWorkers: 32 })
const governor = decideNarutoConcurrency({
  requestedClones: 100,
  totalWorkItems: graph.total_work_items,
  pendingWorkQueueSize: graph.total_work_items,
  backend: 'codex-sdk',
  hardware: { cores: 16, loadAverage: [1, 1, 1], freeMemoryBytes: 64 * 1024 * 1024 * 1024, totalMemoryBytes: 128 * 1024 * 1024 * 1024, fileDescriptorLimit: 8192, processCount: 100, terminalRows: 48, remoteApiRateLimitBudget: 32, localLlmMaxParallelRequests: 8 }
})
const report = {
  schema: 'sks.naruto-extreme-parallelism-check.v1',
  ok: graph.total_work_items >= 200 && governor.safe_active_workers >= 16 && governor.safe_zellij_visible_panes <= governor.safe_active_workers && graph.mixed_work_kinds.length >= 6,
  graph: { total_work_items: graph.total_work_items, mixed_work_kinds: graph.mixed_work_kinds, write_allowed_count: graph.write_allowed_count },
  governor
}
assertGate(report.ok, 'Naruto extreme parallelism must fan out >=2x clones and keep a high safe active pool', report)
emitGate('naruto:extreme-parallelism', report)

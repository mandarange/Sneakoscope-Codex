#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const workGraph = await importDist('core/naruto/naruto-work-graph.js')
const governorMod = await importDist('core/naruto/naruto-concurrency-governor.js')
const activePool = await importDist('core/naruto/naruto-active-pool.js')

const graph = workGraph.buildNarutoWorkGraph({ requestedClones: 20, totalWorkItems: 20, writeCapable: true, maxActiveWorkers: 5 })
const governor = governorMod.decideNarutoConcurrency({
  requestedClones: 20,
  totalWorkItems: 20,
  pendingWorkQueueSize: 20,
  backend: 'fake',
  hardware: { remoteApiRateLimitBudget: 5, fileDescriptorLimit: 4096, freeMemoryBytes: 8 * 1024 * 1024 * 1024, totalMemoryBytes: 16 * 1024 * 1024 * 1024 }
})
const report = activePool.simulateNarutoActivePool({ graph, governor: { ...governor, safe_active_workers: 5 } })

assertGate(report.ok === true, 'active pool must drain cleanly', report)
assertGate(report.max_observed_active_workers <= 5, 'active pool must never exceed safe cap', report)
assertGate(report.max_observed_write_lease_conflicts === 0, 'active pool must never run overlapping write leases concurrently', report)
assertGate(report.completed_count >= graph.total_work_items, 'active pool must complete all base work items', report)
assertGate(report.refill_events >= 5, 'active pool must refill slots as work drains', report)
assertGate(report.duplicate_execution_count === 0, 'active pool must not duplicate work without retry', report)

const sameLeaseGraph = workGraph.buildNarutoWorkGraph({
  requestedClones: 10,
  totalWorkItems: 10,
  writeCapable: true,
  targetPaths: ['src/shared-fixture.ts'],
  maxActiveWorkers: 5
})
const sameLeaseReport = activePool.simulateNarutoActivePool({ graph: sameLeaseGraph, governor: { ...governor, safe_active_workers: 5 } })
assertGate(sameLeaseReport.ok === true, 'same-file work graph must drain without overlapping write leases', sameLeaseReport)
assertGate(sameLeaseReport.max_observed_write_lease_conflicts === 0, 'same-file write items must be serialized or interleaved with read-only work only', sameLeaseReport)

emitGate('naruto:active-pool', {
  safe_active_workers: report.safe_active_workers,
  completed_count: report.completed_count,
  refill_events: report.refill_events,
  max_observed_active_workers: report.max_observed_active_workers,
  same_lease_max_write_conflicts: sameLeaseReport.max_observed_write_lease_conflicts
})

#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const workGraph = await importDist('core/naruto/naruto-work-graph.js')
const governorMod = await importDist('core/naruto/naruto-concurrency-governor.js')
const verificationDag = await importDist('core/naruto/naruto-verification-dag.js')
const verificationPool = await importDist('core/naruto/naruto-verification-pool.js')

const graph = workGraph.buildNarutoWorkGraph({ requestedClones: 8, totalWorkItems: 12, writeCapable: true })
const governor = governorMod.decideNarutoConcurrency({
  requestedClones: 8,
  totalWorkItems: 12,
  backend: 'fake',
  hardware: {
    cores: 4,
    loadAverage: [0, 0, 0],
    remoteApiRateLimitBudget: 8,
    fileDescriptorLimit: 4096,
    processCount: 1,
    zellijPaneCount: 0,
    diskIoPressure: 0,
    freeMemoryBytes: 8 * 1024 * 1024 * 1024,
    totalMemoryBytes: 16 * 1024 * 1024 * 1024
  }
})
const dag = verificationDag.buildNarutoVerificationDag(graph, { cwd: root, command: 'node -e "process.exit(0)"' })
const report = await verificationPool.runNarutoVerificationPool(dag, { ...governor, verification_parallel: 4 }, { cwd: root })

assertGate(report.ok === true, 'verification pool must pass all fixture shards', report)
assertGate(report.safe_concurrency === 4, 'verification pool must use its own safe concurrency', report)
assertGate(report.task_count > 1, 'verification pool must run multiple shards', report)
assertGate(report.cpu_heavy_cap_respected && report.io_heavy_cap_respected && report.api_rate_cap_respected, 'verification pool must respect resource caps', report)

emitGate('naruto:verification-pool', {
  task_count: report.task_count,
  safe_concurrency: report.safe_concurrency,
  passed: report.passed
})

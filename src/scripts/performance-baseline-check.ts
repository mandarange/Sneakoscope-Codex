#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const { writePerformanceProfile } = await importDist('core/perf/performance-profiler.js')
const report = await writePerformanceProfile(root, 'performance-baseline-5.9.0.json')

assertGate(report.blockers.length === 0, 'performance_baseline_failed', report)
emitGate('perf:baseline', {
  commands: report.commands.length,
  slowest_p95_ms: Math.max(...report.commands.map((row) => row.p95_ms), 0),
  report_path: '.sneakoscope/reports/performance-baseline-5.9.0.json'
})

#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const { writeGateTiming } = await importDist('core/release/gate-timing.js')
const report = await writeGateTiming(root)
assertGate(Array.isArray(report.slowest_gates) && report.slowest_gates.length <= 10, 'release gate timing must report slowest gate top 10', report)
assertGate(Number(report.duplicate_build_count || 0) === 0, 'release runner must not contain duplicate build gates', report)
emitGate('release:runner-efficiency', {
  total_ms: report.total_ms,
  duplicate_build_count: report.duplicate_build_count || 0,
  slowest_gates: report.slowest_gates.slice(0, 10),
  underlying_gate_ok: report.ok === true,
  underlying_gate_blockers: report.blockers || []
})

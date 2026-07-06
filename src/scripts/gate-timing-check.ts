#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const { writeGateTiming } = await importDist('core/release/gate-timing.js')
const report = await writeGateTiming(root)
assertGate(report.ok, 'release_gate_timing_failed', report)
emitGate('release:gate-timing', { total_ms: report.total_ms, slowest_gates: report.slowest_gates.slice(0, 3) })

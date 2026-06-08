#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

process.env.SKS_RELEASE_MAX_CPU_LIGHT = '7'
process.env.SKS_RELEASE_MAX_TOTAL = '2'
const governor = await importDist('core/release/release-gate-resource-governor.js')
const budget = governor.defaultReleaseGateBudget()
assertGate(budget['cpu-light'] === 7, 'resource governor must honor SKS_RELEASE_MAX_CPU_LIGHT', budget)
const gate = (id: string) => ({ id, resource: ['cpu-light'], deps: [], command: 'true', side_effect: 'hermetic', timeout_ms: 1000, cache: { enabled: false, inputs: [] }, isolation: { report_dir: 'per-gate' }, preset: ['release'] })
const picked = governor.pickLaunchableReleaseGates({ ready: [gate('a'), gate('b'), gate('c')], running: [], budget })
assertGate(picked.length === 2, 'resource governor must honor SKS_RELEASE_MAX_TOTAL', { picked: picked.map((row: any) => row.id) })
emitGate('release:aggressive-resource-governor', { cpu_light: budget['cpu-light'], total: picked.length })

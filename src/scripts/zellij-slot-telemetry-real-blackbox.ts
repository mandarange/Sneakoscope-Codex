#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const requireZellij = process.env.SKS_REQUIRE_ZELLIJ === '1'
const zellij = spawnSync('zellij', ['--version'], { encoding: 'utf8', timeout: 10000 })
assertGate(!requireZellij || zellij.status === 0, 'SKS_REQUIRE_ZELLIJ=1 requires zellij to be installed and runnable', {
  status: zellij.status,
  stderr: zellij.stderr
})

const telemetry = readText('src/core/zellij/zellij-slot-telemetry.ts')
const swarm = readText('src/core/agents/native-cli-session-swarm.ts')
const pane = readText('src/core/zellij/zellij-slot-pane-renderer.ts')

assertGate(telemetry.includes('appendZellijSlotTelemetry') && telemetry.includes('readZellijSlotTelemetrySnapshot'), 'telemetry ledger/snapshot runtime must exist')
assertGate(swarm.includes('slot_reserved') && swarm.includes('worker_spawned'), 'real worker launch path must emit slot lifecycle telemetry')
assertGate(pane.includes('readZellijSlotTelemetrySnapshot'), 'real slot pane path must render from telemetry snapshot')
emitGate('zellij:slot-telemetry-real', {
  zellij_available: zellij.status === 0,
  required: requireZellij
})

#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const pane = readText('src/core/zellij/zellij-slot-pane-renderer.ts')
const command = readText('src/commands/zellij-slot-pane.ts')

assertGate(pane.includes('readZellijSlotTelemetrySnapshot'), 'slot pane renderer must read telemetry snapshots')
assertGate(pane.includes('waiting for telemetry'), 'slot pane renderer must show waiting fallback before telemetry arrives')
assertGate(pane.includes('latest_heartbeat') || pane.includes('heartbeat'), 'slot pane renderer must surface heartbeat/progress state')
assertGate(command.includes('artifactRoot') && command.includes('--artifact-root'), 'slot pane command must pass artifact root for telemetry lookup')
emitGate('zellij:slot-pane-telemetry-renderer', { snapshot_first: true })

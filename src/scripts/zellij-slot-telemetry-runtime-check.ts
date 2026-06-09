#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const swarm = readText('src/core/agents/native-cli-session-swarm.ts')
const worker = readText('src/core/agents/native-cli-worker.ts')
const requiredEvents = [
  'slot_reserved',
  'worker_spawned',
  'task_started',
  'heartbeat',
  'task_progress',
  'patch_candidate',
  'artifact_written',
  'worker_completed',
  'worker_failed'
]

for (const event of requiredEvents) {
  assertGate(swarm.includes(event) || worker.includes(event), `missing runtime slot telemetry event ${event}`)
}

assertGate(swarm.includes('appendZellijSlotTelemetry'), 'session swarm must append Zellij slot telemetry')
assertGate(worker.includes('appendZellijSlotTelemetry'), 'native worker must append Zellij slot telemetry')
assertGate(worker.includes('startWorkerProgressTelemetry'), 'native worker must emit progress telemetry during backend runtime')
emitGate('zellij:slot-telemetry-runtime', { lifecycle_events: requiredEvents.length, progress_pump: true })

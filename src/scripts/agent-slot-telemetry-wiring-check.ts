#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const swarm = readText('src/core/agents/native-cli-session-swarm.ts')
const worker = readText('src/core/agents/native-cli-worker.ts')
for (const token of ['slot_reserved', 'worker_spawned', 'heartbeat', 'task_progress', 'artifact_written', 'worker_completed', 'worker_failed']) {
  assertGate(swarm.includes(token) || worker.includes(token), `missing telemetry lifecycle event ${token}`)
}
assertGate(swarm.includes('appendZellijSlotTelemetry') && worker.includes('appendZellijSlotTelemetry'), 'swarm and worker must append slot telemetry')
assertGate(worker.includes('startWorkerProgressTelemetry'), 'native worker must pump progress telemetry while backend work is active')
emitGate('agent:slot-telemetry-wiring', { lifecycle_events: 7, progress_pump: true })

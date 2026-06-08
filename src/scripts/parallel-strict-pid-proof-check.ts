#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appendParallelRuntimeEvent, writeParallelRuntimeProof } from '../core/agents/parallel-runtime-proof.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-strict-pid-'))

const missingMission = 'M-strict-pid-missing'
const missingLedger = path.join(root, '.sneakoscope', 'missions', missingMission, 'agents')
await appendParallelRuntimeEvent(missingLedger, missingMission, { event_type: 'batch_dispatch_started', slot_id: null, generation_index: null, session_id: null, pid: null, backend: 'fixture', placement: 'unknown', batch_id: 'b1' })
for (let i = 1; i <= 16; i++) {
  await appendParallelRuntimeEvent(missingLedger, missingMission, { event_type: 'worker_launch_invoked', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: null, backend: 'fixture', placement: 'process', batch_id: 'b1' })
}
await appendParallelRuntimeEvent(missingLedger, missingMission, { event_type: 'batch_dispatch_completed', slot_id: null, generation_index: null, session_id: null, pid: null, backend: 'fixture', placement: 'unknown', batch_id: 'b1' })
await new Promise((resolve) => setTimeout(resolve, 20))
for (let i = 1; i <= 16; i++) {
  await appendParallelRuntimeEvent(missingLedger, missingMission, { event_type: 'worker_completed', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: null, backend: 'fixture', placement: 'process' })
}
const missingProof = await writeParallelRuntimeProof(missingLedger, missingMission, {
  proofMode: 'production',
  requireWorkerPids: true,
  requestedWorkers: 16,
  targetActiveSlots: 16,
  expectedWorkerRuntimeMs: 4000,
  minActiveWorkers: 16,
  minSpeedupRatio: 1
})
assertGate(missingProof.passed === false, 'production proof without worker PIDs must fail', missingProof)
assertGate(missingProof.blockers.includes('unique_worker_pids_missing_in_production_proof'), 'missing PID blocker absent', missingProof)

const presentMission = 'M-strict-pid-present'
const presentLedger = path.join(root, '.sneakoscope', 'missions', presentMission, 'agents')
await appendParallelRuntimeEvent(presentLedger, presentMission, { event_type: 'batch_dispatch_started', slot_id: null, generation_index: null, session_id: null, pid: null, backend: 'fixture', placement: 'unknown', batch_id: 'b2' })
for (let i = 1; i <= 16; i++) {
  await appendParallelRuntimeEvent(presentLedger, presentMission, { event_type: 'worker_launch_invoked', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: null, backend: 'fixture', placement: 'process', batch_id: 'b2' })
  await appendParallelRuntimeEvent(presentLedger, presentMission, { event_type: 'worker_process_spawned', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: 5000 + i, backend: 'fixture', placement: 'process', batch_id: 'b2' })
}
await appendParallelRuntimeEvent(presentLedger, presentMission, { event_type: 'batch_dispatch_completed', slot_id: null, generation_index: null, session_id: null, pid: null, backend: 'fixture', placement: 'unknown', batch_id: 'b2' })
await new Promise((resolve) => setTimeout(resolve, 20))
for (let i = 1; i <= 16; i++) {
  await appendParallelRuntimeEvent(presentLedger, presentMission, { event_type: 'worker_completed', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: 5000 + i, backend: 'fixture', placement: 'process' })
}
const presentProof = await writeParallelRuntimeProof(presentLedger, presentMission, {
  proofMode: 'production',
  requireWorkerPids: true,
  requestedWorkers: 16,
  targetActiveSlots: 16,
  expectedWorkerRuntimeMs: 4000,
  minActiveWorkers: 16,
  minSpeedupRatio: 1
})
assertGate(presentProof.passed === true && presentProof.unique_worker_pids === 16, 'production proof with PID evidence must pass', presentProof)
emitGate('parallel:strict-pid-proof', { missing: missingProof.blockers, unique_worker_pids: presentProof.unique_worker_pids })

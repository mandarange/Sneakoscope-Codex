#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appendParallelRuntimeEvent, writeParallelRuntimeProof } from '../core/agents/parallel-runtime-proof.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const missionId = 'M-parallel-proof-fixture'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-parallel-proof-'))
const ledgerRoot = path.join(root, '.sneakoscope', 'missions', missionId, 'agents')
await appendParallelRuntimeEvent(ledgerRoot, missionId, { event_type: 'batch_dispatch_started', slot_id: null, generation_index: null, session_id: null, pid: null, backend: 'fixture', placement: 'unknown', batch_id: 'batch-1' })
for (let i = 1; i <= 4; i++) {
  await appendParallelRuntimeEvent(ledgerRoot, missionId, { event_type: 'worker_launch_invoked', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: null, backend: 'fixture', placement: 'process', batch_id: 'batch-1' })
  await appendParallelRuntimeEvent(ledgerRoot, missionId, { event_type: 'worker_process_spawned', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: 4000 + i, backend: 'fixture', placement: 'process', batch_id: 'batch-1' })
}
await appendParallelRuntimeEvent(ledgerRoot, missionId, { event_type: 'batch_dispatch_completed', slot_id: null, generation_index: null, session_id: null, pid: null, backend: 'fixture', placement: 'unknown', batch_id: 'batch-1' })
await new Promise((resolve) => setTimeout(resolve, 30))
for (let i = 1; i <= 4; i++) await appendParallelRuntimeEvent(ledgerRoot, missionId, { event_type: 'worker_completed', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: 4000 + i, backend: 'fixture', placement: 'process' })
const proof = await writeParallelRuntimeProof(ledgerRoot, missionId, { requestedWorkers: 4, targetActiveSlots: 4, expectedWorkerRuntimeMs: 4000, minSpeedupRatio: 1 })
assertGate(proof.passed === true && proof.unique_worker_pids === 4 && proof.max_observed_active_workers >= 4, 'parallel runtime proof fixture failed', proof)
emitGate('parallel:runtime-proof', proof)

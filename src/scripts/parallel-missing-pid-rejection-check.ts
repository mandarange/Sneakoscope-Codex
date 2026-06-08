#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appendParallelRuntimeEvent, writeParallelRuntimeProof } from '../core/agents/parallel-runtime-proof.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

async function writeNoPidFixture(root, missionId, count) {
  const ledger = path.join(root, '.sneakoscope', 'missions', missionId, 'agents')
  await appendParallelRuntimeEvent(ledger, missionId, { event_type: 'batch_dispatch_started', slot_id: null, generation_index: null, session_id: null, pid: null, backend: 'fixture', placement: 'unknown', batch_id: 'b' })
  for (let i = 1; i <= count; i++) {
    await appendParallelRuntimeEvent(ledger, missionId, { event_type: 'worker_launch_invoked', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: null, backend: 'fixture', placement: 'process', batch_id: 'b' })
  }
  await appendParallelRuntimeEvent(ledger, missionId, { event_type: 'batch_dispatch_completed', slot_id: null, generation_index: null, session_id: null, pid: null, backend: 'fixture', placement: 'unknown', batch_id: 'b' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  for (let i = 1; i <= count; i++) {
    await appendParallelRuntimeEvent(ledger, missionId, { event_type: 'worker_completed', slot_id: `slot-${i}`, generation_index: 1, session_id: `s-${i}`, pid: null, backend: 'fixture', placement: 'process' })
  }
  return ledger
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-missing-pid-'))
const productionLedger = await writeNoPidFixture(root, 'M-prod-no-pid', 16)
const production = await writeParallelRuntimeProof(productionLedger, 'M-prod-no-pid', {
  proofMode: 'production',
  requestedWorkers: 16,
  targetActiveSlots: 16,
  expectedWorkerRuntimeMs: 4000,
  minActiveWorkers: 16,
  minSpeedupRatio: 1
})
assertGate(production.passed === false, 'production writeParallelRuntimeProof must reject missing PID evidence', production)

const badOverride = await writeParallelRuntimeProof(productionLedger, 'M-prod-no-pid', {
  proofMode: 'production',
  allowMissingPids: true,
  requestedWorkers: 16,
  targetActiveSlots: 16,
  expectedWorkerRuntimeMs: 4000,
  minActiveWorkers: 16,
  minSpeedupRatio: 1
})
assertGate(badOverride.passed === false && badOverride.allow_missing_pids === false, 'production allowMissingPids must be ignored', badOverride)

const fixtureLedger = await writeNoPidFixture(root, 'M-fixture-no-pid', 16)
const fixture = await writeParallelRuntimeProof(fixtureLedger, 'M-fixture-no-pid', {
  proofMode: 'in-process-fixture',
  requireWorkerPids: false,
  allowMissingPids: true,
  requestedWorkers: 16,
  targetActiveSlots: 16,
  expectedWorkerRuntimeMs: 4000,
  minActiveWorkers: 16,
  minSpeedupRatio: 1
})
assertGate(fixture.passed === true && fixture.allow_missing_pids === true, 'only in-process fixture may opt out of PID evidence', fixture)
emitGate('parallel:missing-pid-rejection', { production_blockers: production.blockers, fixture_passed: fixture.passed })

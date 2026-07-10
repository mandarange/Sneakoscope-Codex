#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { runAgentScheduler } from '../core/agents/agent-scheduler.js'
import { appendParallelRuntimeEvent, writeParallelRuntimeProof } from '../core/agents/parallel-runtime-proof.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const missionId = 'M-parallel-real-blackbox'
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-parallel-real-'))
const ledgerRoot = path.join(tmp, '.sneakoscope', 'missions', missionId, 'agents')
const workers = 4
const sleepMs = 750
const roster = { agent_count: workers, concurrency: workers, roster: Array.from({ length: workers }, (_, i) => ({ id: `agent_${i + 1}`, persona_id: `p${i + 1}`, role: 'verifier', write_policy: 'read-only' })) }
const partition = { slices: Array.from({ length: workers }, (_, i) => ({ id: `work-${i + 1}`, role: 'verifier', description: `sleep ${i + 1}`, write_paths: [], readonly_paths: [] })) }
const started = Date.now()
await runAgentScheduler({
  root: ledgerRoot,
  missionId,
  rootHash: 'fixture',
  roster,
  partition,
  targetActiveSlots: workers,
  maxActiveSlots: workers,
  launchSession: async ({ generation, slot, agent, workItem }) => {
    const child = spawn(process.execPath, ['-e', `setTimeout(()=>process.exit(0), ${sleepMs})`], { stdio: 'ignore' })
    await appendParallelRuntimeEvent(ledgerRoot, missionId, { event_type: 'worker_process_spawned', slot_id: slot.slot_id, generation_index: generation.generation_index, session_id: generation.session_id, pid: child.pid || null, backend: 'fixture-process', placement: 'process' })
    await new Promise((resolve) => child.on('close', resolve))
    await appendParallelRuntimeEvent(ledgerRoot, missionId, { event_type: 'worker_completed', slot_id: slot.slot_id, generation_index: generation.generation_index, session_id: generation.session_id, pid: child.pid || null, backend: 'fixture-process', placement: 'process' })
    return { schema: 'sks.agent-result.v1', mission_id: missionId, agent_id: agent.id, session_id: generation.session_id, persona_id: agent.persona_id, task_slice_id: workItem.id, status: 'done', backend: 'process', summary: 'done', findings: [], proposed_changes: [], changed_files: [], lease_compliance: { ok: true, violations: [] }, artifacts: [], blockers: [], confidence: 'high', handoff_notes: '', unverified: [], writes: [], recursion_guard: { ok: true, violations: [] }, verification: { status: 'passed', checks: ['sleep'] } }
  }
})
const proof = await writeParallelRuntimeProof(ledgerRoot, missionId, { requestedWorkers: workers, targetActiveSlots: workers, expectedWorkerRuntimeMs: sleepMs, minActiveWorkers: 4, minSpeedupRatio: 2, firstBatchLaunchSpanLimitMs: 2500 })
const wall = Date.now() - started
assertGate(proof.unique_worker_pids >= 4, 'unique worker pids must prove four real processes', proof)
assertGate(proof.max_observed_active_workers >= 4, 'max active workers must reach the desktop-safe cap', proof)
assertGate(proof.first_batch_launch_span_ms <= 2500, 'first batch launch span must be <= 2500ms', proof)
assertGate(wall < 5000 && proof.wall_ms < 5000, 'wall clock must be under 5s', { wall, proof })
assertGate(proof.sequential_estimate_ms >= 3000 && proof.speedup_ratio >= 2, 'speedup proof must be >= 2x', proof)
assertGate(proof.overlap_windows.some((row) => row.active_workers >= 4), 'overlap window with four workers missing', proof)
assertGate(proof.passed === true, 'parallel runtime proof must pass', proof)
emitGate('parallel:runtime-real-blackbox', { wall_ms: wall, proof })

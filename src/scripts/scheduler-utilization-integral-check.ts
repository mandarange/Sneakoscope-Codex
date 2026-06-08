#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runAgentScheduler } from '../core/agents/agent-scheduler.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const sleepMs = 2000

async function runFixture(targetActiveSlots) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `sks-scheduler-util-${targetActiveSlots}-`))
  const missionId = `M-scheduler-util-${targetActiveSlots}`
  const roster = {
    agent_count: 10,
    concurrency: targetActiveSlots,
    roster: Array.from({ length: 10 }, (_, i) => ({ id: `agent_${i + 1}`, persona_id: `p${i + 1}`, role: 'verifier', write_policy: 'read-only' }))
  }
  const partition = {
    slices: Array.from({ length: 10 }, (_, i) => ({ id: `work-${i + 1}`, role: 'verifier', description: `sleep ${i + 1}`, write_paths: [], readonly_paths: [] }))
  }
  const started = Date.now()
  const result = await runAgentScheduler({
    root,
    missionId,
    rootHash: 'fixture',
    roster,
    partition,
    targetActiveSlots,
    maxActiveSlots: 10,
    launchSession: async ({ generation, agent, workItem }) => {
      await new Promise((resolve) => setTimeout(resolve, sleepMs))
      return {
        schema: 'sks.agent-result.v1',
        mission_id: missionId,
        agent_id: agent.id,
        session_id: generation.session_id,
        persona_id: agent.persona_id,
        task_slice_id: workItem.id,
        status: 'done',
        backend: 'fixture',
        summary: 'done',
        findings: [],
        proposed_changes: [],
        changed_files: [],
        lease_compliance: { ok: true, violations: [] },
        artifacts: [],
        blockers: [],
        confidence: 'high',
        handoff_notes: '',
        unverified: [],
        writes: [],
        recursion_guard: { ok: true, violations: [] },
        verification: { status: 'passed', checks: ['sleep'] }
      }
    }
  })
  return { wall: Date.now() - started, state: result.state }
}

const ten = await runFixture(10)
assertGate(ten.wall < 5000, '10-slot scheduler wall time must stay under 5s', ten)
assertGate(ten.state.active_slot_time_ms >= 15000 && ten.state.active_slot_time_ms <= 26000, '10-slot active time integral must approximate 10*2000ms', ten.state)
assertGate(ten.state.scheduler_utilization >= 0.65, '10-slot scheduler utilization too low', ten.state)

const two = await runFixture(2)
assertGate(two.wall >= 8000 && two.wall < 15000, '2-slot scheduler wall time must be approximately sequential/2', two)
assertGate(two.state.active_slot_time_ms >= 15000 && two.state.active_slot_time_ms <= 26000, '2-slot active time integral must approximate total worker runtime', two.state)
assertGate(two.state.scheduler_utilization >= 0.75, '2-slot scheduler utilization too low', two.state)

emitGate('scheduler:utilization-integral', { ten: ten.state, two: two.state })

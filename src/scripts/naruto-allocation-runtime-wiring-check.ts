#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { runNativeAgentOrchestrator } from '../core/agents/agent-orchestrator.js'
import { buildNarutoCloneRoster } from '../core/agents/agent-roster.js'
import { buildNarutoWorkGraph } from '../core/naruto/naruto-work-graph.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-naruto-runtime-wiring-'))
const roster = buildNarutoCloneRoster({ clones: 3, readonly: true, prompt: 'runtime wiring check' })
const graph = buildNarutoWorkGraph({
  requestedClones: 3,
  totalWorkItems: 3,
  readonly: true,
  writeCapable: false,
  allocationAssignments: [
    assignment('NW-000001', 'naruto_clone_001', 42),
    assignment('NW-000002', 'naruto_clone_002', 41),
    assignment('NW-000003', 'naruto_clone_999', 1)
  ]
})
const result = await runNativeAgentOrchestrator({
  root,
  route: '$Naruto',
  routeCommand: 'sks naruto run',
  routeBlackboxKind: 'allocation_runtime_wiring_gate',
  prompt: 'Naruto allocation runtime wiring check',
  roster,
  agents: 3,
  concurrency: 2,
  targetActiveSlots: 2,
  desiredWorkItemCount: 3,
  minimumWorkItems: 3,
  backend: 'fake',
  backendExplicit: true,
  mock: true,
  readonly: true,
  nativeCliSwarm: false,
  narutoMode: true,
  narutoWorkGraph: graph,
  narutoAllocationPolicy: { schema: 'sks.naruto-allocation-policy.v1', ok: true, assignments: graph.work_items.map((item) => ({ task_id: item.id, owner: item.owner })) },
  narutoRebalancePolicy: { schema: 'sks.naruto-rebalance-policy.v1', ok: true, decisions: [] }
})
const ledgerRoot = path.join(root, result.ledger_root || '.')
const wiring = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'naruto-runtime-wiring.json'), 'utf8'))
const queue = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'agent-work-queue.json'), 'utf8'))
const owners = queue.items.map((item) => item.slice?.owner_agent_id)
const runtimeProofs = (result.results || []).map((row) => row.naruto_runtime).filter(Boolean)
const schedulerOk = result.scheduler?.state?.completed_count === 3
  && result.scheduler?.state?.failed_count === 0
  && result.scheduler?.state?.blocked_count === 0
  && result.scheduler?.state?.pending_queue_drained === true
  && Array.isArray(result.scheduler?.state?.blockers)
  && result.scheduler.state.blockers.length === 0
const ok = schedulerOk
  && wiring.ok === true
  && wiring.scheduler_slice_count === 3
  && owners.includes('naruto_clone_001')
  && owners.includes('naruto_clone_002')
  && wiring.slice_owners.some((row) => row.original_owner === 'naruto_clone_999' && row.rebalanced === true)
  && runtimeProofs.length === 3
  && runtimeProofs.every((row) => row.source_of_truth === 'agent-orchestrator-scheduler')

assertGate(ok, 'Naruto allocation must be wired into scheduler slices, queue ownership, and worker runtime proof', {
  result_ok: result.ok,
  result_proof_blockers: result.proof?.blockers || [],
  scheduler: result.scheduler?.state || null,
  wiring,
  owners,
  runtimeProofs
})
emitGate('naruto:allocation-runtime-wiring', {
  wiring,
  owners,
  scheduler_ok: schedulerOk,
  runtime_proof_count: runtimeProofs.length
})

function assignment(taskId, owner, score) {
  return {
    task_id: taskId,
    owner,
    allocation_reason: `fixture owner ${owner}`,
    allocation_score: score,
    hints: {
      role: 'verifier',
      paths: ['src/core/naruto/runtime.ts'],
      domains: ['src/core/naruto'],
      writePaths: []
    }
  }
}

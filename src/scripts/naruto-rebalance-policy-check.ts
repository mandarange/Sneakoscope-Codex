#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { rebalanceNarutoReadyWork } from '../core/naruto/naruto-rebalance-policy.js'
import type { NarutoWorkItem } from '../core/naruto/naruto-work-item.js'

const item = (id: string, dependencies: string[] = []): NarutoWorkItem => ({
  id,
  kind: 'verification',
  title: id,
  target_paths: ['src/core/naruto/runtime.ts'],
  readonly_paths: ['src/core/naruto/runtime.ts'],
  write_paths: [],
  required_role: 'verifier',
  write_allowed: false,
  verification_required: true,
  dependencies,
  can_run_in_parallel_with: [],
  conflicts_with: [],
  estimated_cost: { tokens: 1, latency_ms: 1, cpu_weight: 1, memory_mb: 1, gpu_weight: 0 },
  lease_requirements: [],
  acceptance: { requires_patch_envelope: false, requires_verification: true, requires_gpt_final: false }
})
const decisions = rebalanceNarutoReadyWork({
  tasks: [item('A'), item('B', ['A'])],
  workers: [{ id: 'idle-1', role: 'verifier', lane: 'src/core', alive: true, state: 'idle' }],
  completedTaskIds: []
})
const inactiveOwner = rebalanceNarutoReadyWork({
  tasks: [{ ...item('C'), owner: 'missing-worker' }],
  workers: [{ id: 'idle-2', role: 'verifier', lane: 'src/core', alive: true, state: 'idle' }],
  completedTaskIds: []
})
const writeConflict = rebalanceNarutoReadyWork({
  tasks: [{ ...item('D'), write_paths: ['src/core/naruto/runtime.ts'], write_allowed: true }],
  workers: [{ id: 'idle-3', role: 'verifier', lane: 'src/core', alive: true, state: 'idle' }],
  completedTaskIds: [],
  activeWritePaths: ['src/core/naruto/runtime.ts']
})
assertGate(decisions.length === 1 && decisions[0]?.task_id === 'A'
  && inactiveOwner.length === 1 && inactiveOwner[0]?.worker_id === 'idle-2'
  && writeConflict.length === 0,
  'Naruto rebalance must assign dependency-ready work, reassign inactive owners, and skip active write conflicts',
  { decisions, inactiveOwner, writeConflict })
emitGate('naruto:rebalance-policy', { decisions, inactiveOwner, writeConflict })

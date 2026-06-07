#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { allocateNarutoTasksToWorkers, chooseNarutoTaskOwner } from '../core/naruto/naruto-allocation-policy.js'
import type { NarutoWorkItem } from '../core/naruto/naruto-work-item.js'

const base = {
  kind: 'implementation',
  title: 'impl',
  target_paths: ['src/core/naruto/runtime.ts'],
  readonly_paths: [],
  write_paths: ['src/core/naruto/runtime.ts'],
  required_role: 'implementer',
  write_allowed: true,
  verification_required: true,
  dependencies: [],
  can_run_in_parallel_with: [],
  conflicts_with: [],
  estimated_cost: { tokens: 1, latency_ms: 1, cpu_weight: 1, memory_mb: 1, gpu_weight: 0 },
  lease_requirements: [{ path: 'src/core/naruto/runtime.ts', kind: 'write' }],
  acceptance: { requires_patch_envelope: true, requires_verification: true, requires_gpt_final: true }
} satisfies Omit<NarutoWorkItem, 'id'>
const workers = [
  { id: 'w1', role: 'implementer', lane: 'src/core' },
  { id: 'w2', role: 'verifier', lane: 'src/scripts' }
]
const decision = chooseNarutoTaskOwner({ ...base, id: 'T1' }, workers)
const blocked = chooseNarutoTaskOwner({ ...base, id: 'T2', dependencies: ['T0'] }, workers)
const assignments = allocateNarutoTasksToWorkers([{ ...base, id: 'T1' }, { ...base, id: 'T2', required_role: 'verifier' }], workers)
const ok = decision.owner === 'w1'
  && decision.score >= 24
  && blocked.score === Number.NEGATIVE_INFINITY
  && assignments.length === 2
assertGate(ok, 'Naruto allocation policy must score role/lane overlap and block incomplete dependencies with -Infinity', { decision, blocked, assignments })
emitGate('naruto:allocation-policy', { decision, blocked, assignments })

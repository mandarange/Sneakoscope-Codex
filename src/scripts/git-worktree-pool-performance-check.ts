#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const poolMod = await importDist('core/git/git-worktree-pool.js')
const workerIds = Array.from({ length: 100 }, (_, index) => `worker-${index + 1}`)
const reusable = Array.from({ length: 32 }, (_, index) => `/tmp/reuse-${index + 1}`)
const start = Date.now()
const plan = poolMod.planGitWorktreePool({ workerIds, reusableWorktrees: reusable })
const elapsed = Date.now() - start

assertGate(plan.ok === true, 'pool plan must pass', plan)
assertGate(plan.assignments.length === 100, 'pool must assign every requested worker', plan)
assertGate(plan.assignments.filter((row) => row.action === 'reuse').length === 32, 'pool must reuse available worktrees first', plan)
assertGate(plan.allocate_count === 68, 'pool must allocate only the remaining workers', plan)
assertGate(elapsed < 100, 'pool plan must stay fast for 100 workers', { elapsed })

emitGate('git:worktree-pool-performance', {
  elapsed_ms: elapsed,
  reusable: 32,
  allocate_count: plan.allocate_count
})

#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const manager = readText('src/core/git/git-worktree-manager.ts')
const pool = readText('src/core/git/git-worktree-pool.ts')
assertGate(manager.includes('allocateWorkerWorktreesBatch') && manager.includes('Promise.all(workers)'), 'batch worktree allocation API/pool missing')
assertGate(manager.includes('worktree_allocation_started') && manager.includes('worktree_allocation_completed'), 'worktree allocation proof events missing')
assertGate(pool.includes('allocateWorkerWorktreesBatch'), 'worktree pool must export batch allocation')
emitGate('git:worktree-batch-allocation')

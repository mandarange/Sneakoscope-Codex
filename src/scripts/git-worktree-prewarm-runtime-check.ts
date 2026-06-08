#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/agents/agent-orchestrator.ts')
assertGate(src.includes('preparedWorktreeAllocations') && src.includes('prewarmed_allocations') && src.includes('allocateWorkerWorktreesBatch'), 'orchestrator must prewarm write-capable git worktrees before scheduler launch')
emitGate('git:worktree-prewarm-runtime')

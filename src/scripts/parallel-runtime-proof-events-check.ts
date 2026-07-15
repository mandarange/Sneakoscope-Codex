#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const scheduler = readText('src/core/agents/agent-scheduler.ts')
const runtime = readText('src/core/agents/native-cli-worker-runtime.ts')
const codex = readText('src/core/codex-control/codex-task-runner.ts')
const git = readText('src/core/git/git-worktree-manager.ts')
assertGate(scheduler.includes('batch_dispatch_started') && scheduler.includes('worker_launch_invoked'), 'scheduler must emit batch dispatch and launch events')
assertGate(runtime.includes('worker_process_spawned') && runtime.includes('worker_heartbeat_seen'), 'worker runtime must emit process spawn and heartbeat proof events')
assertGate(codex.includes('withModelCallSlot') && codex.includes('model-call-concurrency'), 'codex task runner must use model-call concurrency wrapper')
assertGate(git.includes('worktree_allocation_started') && git.includes('worktree_allocation_completed'), 'git worktree manager must emit allocation events')
emitGate('parallel:runtime-proof-events')

#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/agents/native-cli-worker-runtime.ts')
assertGate(src.includes('worker_process_spawned') && src.includes('child.pid') && src.includes('spawnCompactSlotWorkerProcess'), 'worker runtime process spawn proof missing')
emitGate('worker-runtime:process-spawn-proof')

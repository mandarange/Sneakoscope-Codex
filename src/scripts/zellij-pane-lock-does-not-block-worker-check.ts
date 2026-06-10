#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const swarm = readText('src/core/agents/native-cli-session-swarm.ts')
const processRunStart = swarm.indexOf('const processRun = liveWorkerPane')
const compactBlock = swarm.slice(processRunStart, swarm.indexOf('const zellijRequired'))
assertGate(processRunStart >= 0, 'native swarm compact branch missing')
assertGate(compactBlock.indexOf('spawnCompactSlotWorkerProcess') >= 0 && compactBlock.indexOf('spawnCompactSlotWorkerProcess') < compactBlock.indexOf('openWorkerPane'), 'compact worker process must spawn before pane creation')
const parallel = readText('src/core/agents/parallel-runtime-proof.ts')
for (const event of ['worker_process_spawned', 'zellij_pane_creation_lock_requested', 'zellij_pane_created']) {
  assertGate(parallel.includes(event), `parallel proof event missing ${event}`)
}
emitGate('zellij:pane-lock-does-not-block-worker')

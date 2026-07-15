#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/agents/native-cli-worker-runtime.ts')
const processRunStart = src.indexOf('const processRun = liveWorkerPane')
const compactBlock = src.slice(processRunStart, src.indexOf('const launchBlockers'))
assertGate(processRunStart >= 0, 'worker runtime must branch compact worker process from liveWorkerPane mode')
assertGate(compactBlock.includes('spawnCompactSlotWorkerProcess') && compactBlock.indexOf('spawnCompactSlotWorkerProcess') < compactBlock.indexOf('openWorkerPane'), 'compact worker process should spawn before pane renderer path')
assertGate(src.includes("process.env.SKS_REQUIRE_ZELLIJ === '1'") && src.includes('launchWarnings'), 'Zellij pane failure must only block when required')
emitGate('worker-runtime:zellij-does-not-block-workers')

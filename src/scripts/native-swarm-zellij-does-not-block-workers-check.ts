#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/agents/native-cli-session-swarm.ts')
const compactBlock = src.slice(src.indexOf('const processRun = uiMode'), src.indexOf('const launchBlockers'))
assertGate(compactBlock.includes('spawnCompactSlotWorkerProcess') && compactBlock.indexOf('spawnCompactSlotWorkerProcess') < compactBlock.indexOf('openWorkerPane'), 'compact worker process should spawn before pane renderer path')
assertGate(src.includes("process.env.SKS_REQUIRE_ZELLIJ === '1'") && src.includes('launchWarnings'), 'Zellij pane failure must only block when required')
emitGate('native-swarm:zellij-does-not-block-workers')

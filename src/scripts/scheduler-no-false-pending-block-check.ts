#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/agents/agent-scheduler.ts')
assertGate(src.includes('batchDispatchInProgress') && src.includes('!batchDispatchInProgress && active.size === 0'), 'scheduler pending block guard must account for batch dispatch')
emitGate('scheduler:no-false-pending-block')

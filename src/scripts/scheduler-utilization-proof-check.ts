#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/agents/agent-scheduler.ts')
for (const token of ['batch_dispatch_count', 'largest_batch_size', 'first_batch_launch_span_ms', 'average_batch_launch_span_ms', 'scheduler_utilization', 'active_slot_time_ms', 'wall_time_ms']) assertGate(src.includes(token), `scheduler metric missing: ${token}`)
emitGate('scheduler:utilization-proof')

#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/agents/native-cli-session-swarm.ts')
assertGate(src.includes('SKS_ZELLIJ_WORKER_HEARTBEAT_TIMEOUT_MS || 5000'), 'heartbeat launch proof timeout must default to 5000ms')
assertGate(src.includes('zellij_worker_heartbeat_missing_launch_warning') && !src.includes("...(heartbeatOk ? [] : ['zellij_worker_heartbeat_missing'])"), 'missing heartbeat must be warning before result timeout, not launch failure')
emitGate('native-swarm:heartbeat-does-not-serialize-launch')

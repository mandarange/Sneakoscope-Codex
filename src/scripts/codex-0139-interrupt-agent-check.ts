#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, readText } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-multi-agent-event-normalizer.js')
const interrupt = mod.normalizeCodexMultiAgentEventName('interrupt_agent')
const close = mod.normalizeCodexMultiAgentEventName('close_agent')
const start = mod.normalizeCodexMultiAgentEventName('spawn_agent')
const currentClose = mod.normalizeCodexMultiAgentEventName('closeAgent')
const currentStart = mod.normalizeCodexMultiAgentEventName('spawnAgent')
assertGate(interrupt.canonical === 'interrupt_agent' && interrupt.stage === 'result', 'interrupt_agent must map to result stage', interrupt)
assertGate(close.canonical === 'close_agent' && close.stage === 'result', 'close_agent must remain result stage', close)
assertGate(start.canonical === 'start_agent' && start.stage === 'start', 'spawn_agent must map to start stage', start)
assertGate(currentClose.canonical === 'close_agent' && currentClose.stage === 'result', '0.144.1 closeAgent must map to result stage', currentClose)
assertGate(currentStart.canonical === 'start_agent' && currentStart.stage === 'start', '0.144.1 spawnAgent must map to start stage', currentStart)
const runtimeCore = readText('src/core/pipeline-internals/runtime-core.ts')
assertGate(runtimeCore.includes('normalizeCodexMultiAgentEventName'), 'runtime-core subagent evidence must use the 0.139 normalizer')
emitGate('codex:0139-interrupt-agent', { canonical_events: [interrupt.canonical, close.canonical, start.canonical, currentClose.canonical, currentStart.canonical] })

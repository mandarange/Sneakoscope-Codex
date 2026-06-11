#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-0139-multi-agent-real-probe.js')
const result = await mod.runCodex0139InterruptAgentRealProbe({ requireReal: true })
assertGate(result.ok === true, 'Codex 0.139 interrupt_agent real event stream probe must pass', result)
emitGate('codex:0139-interrupt-agent-real', result.evidence)

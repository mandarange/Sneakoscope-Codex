#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const orchestrator = readText('src/core/agents/agent-orchestrator.ts')
const command = readText('src/core/commands/naruto-command.ts')
assertGate(orchestrator.includes('writeParallelRuntimeProof') && orchestrator.includes('parallel_runtime_proof'), 'orchestrator must write parallel runtime proof')
assertGate(command.includes('parallel_runtime') && command.includes('parallel_runtime_proof_below_gate'), 'Naruto result/gate must include parallel runtime proof')
emitGate('naruto:parallel-runtime-proof')

#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const command = readText('src/core/commands/naruto-command.ts')
assertGate(command.includes('passed: result.ok === true && nativeProofOk && finalAccepted && parallelRuntimeOk'), 'Naruto gate passed condition must include parallelRuntimeOk')
assertGate(command.includes('naruto_parallel_runtime_proof_below_gate'), 'Naruto gate must keep blocker for insufficient parallel runtime proof')
emitGate('naruto:parallel-gate-consistency')

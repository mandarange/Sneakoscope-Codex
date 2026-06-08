#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const proofPolicy = readText('src/core/proof/route-proof-policy.ts')
const proofGate = readText('src/core/proof/route-proof-gate.ts')
const runtimeGates = readText('src/core/pipeline-internals/runtime-gates.ts')

assertGate(proofPolicy.includes('team') && proofPolicy.includes('$Naruto'), 'proof policy must normalize Team aliases to Naruto')
assertGate(proofGate.includes('MAX_NARUTO_AGENT_COUNT') || proofGate.includes('100'), 'Naruto proof gate must allow Naruto clone ceiling')
assertGate(runtimeGates.includes('naruto-gate.json'), 'runtime gates must recognize naruto-gate.json')
emitGate('naruto:ssot-gate-aliases', { proof_aliases: true })

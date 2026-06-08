#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const source = readText('src/core/research/research-stage-runner.ts')
const start = source.indexOf('async function runSynthesisStage')
const end = source.indexOf('async function runDeterministicMockSynthesisStage')
const runSynthesisStage = source.slice(start, end)

assertGate(start >= 0 && end > start, 'runSynthesisStage and mock branch must exist')
assertGate(runSynthesisStage.includes("input.backend === 'mock'") && runSynthesisStage.includes("input.backend === 'deterministic'"), 'synthesis stage must branch mock/deterministic explicitly', runSynthesisStage)
assertGate(runSynthesisStage.includes('runResearchCodexSynthesisWriter'), 'non-mock synthesis must call runResearchCodexSynthesisWriter', runSynthesisStage)
assertGate(!runSynthesisStage.includes('buildDeterministicMockResearchReport'), 'non-mock branch must not call deterministic report builder', runSynthesisStage)
assertGate(source.includes('synthesis_writer'), 'synthesis stage result metrics must include synthesis_writer', source)

emitGate('research:real-synthesis-no-deterministic-renderer', { ok: true })

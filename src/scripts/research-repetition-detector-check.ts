#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const detector = await importDist('core/research/research-repetition-detector.js')
const realistic = await importDist('core/research/research-realistic-report.js')

const repeated = Array.from({ length: 30 }, (_unused, index) => `Runtime evidence note ${index + 1}: This paragraph exists to make report quality measurable while a deterministic fixture repeats the same claim with source-${index % 2}.`).join('\n\n')
const bad = detector.analyzeResearchRepetition(repeated)
assertGate(bad.ok === false, 'repeated template prose must fail', bad)
assertGate(bad.blockers.some((reason) => reason.startsWith('research_report_template_phrase_hit:')), 'template phrase blocker missing', bad)

const goodText = realistic.buildRealisticResearchReport({
  plan: { mission_id: 'M-REPETITION-GOOD', prompt: 'repetition detector check' },
  sourceIds: Array.from({ length: 14 }, (_unused, index) => `source-${index + 1}`),
  counterevidenceIds: ['counter-1', 'counter-2']
})
const good = detector.analyzeResearchRepetition(goodText)
assertGate(good.ok === true, 'realistic varied report should pass repetition detector', good)
assertGate(good.repeated_paragraph_ratio <= 0.18, 'realistic report repeated paragraph ratio too high', good)

emitGate('research:repetition-detector', { bad, good })

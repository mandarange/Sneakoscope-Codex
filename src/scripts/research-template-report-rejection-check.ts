#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')
const fsx = await importDist('core/fsx.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-template-rejection-'))
const plan = await research.writeResearchPlan(dir, 'template report rejection blackbox', { missionId: 'M-TEMPLATE-REJECTION' })
await research.writeMockResearchResult(dir, plan)
const repeated = [
  '# SKS Research Report',
  '',
  '## Question',
  'Runtime evidence note: This paragraph exists to make report quality measurable.',
  '',
  '## Methodology',
  'Runtime evidence note: This paragraph exists to make report quality measurable.',
  '',
  '## Source Map',
  'mock-source-1 mock-source-2 mock-source-3 mock-source-4 mock-source-5 mock-source-6 mock-source-7 mock-source-8.',
  '',
  '## Key Claims',
  '- mock-claim-1 cites mock-source-1.',
  '',
  '## Evidence Matrix Summary',
  'Runtime evidence note: This paragraph exists to make report quality measurable.',
  '',
  '## Counterevidence',
  'mock-counter-1 and mock-counter-2 challenge the report.',
  '',
  '## Falsification',
  'Runtime evidence note: This paragraph exists to make report quality measurable.',
  '',
  '## Implementation Blueprint',
  Array.from({ length: 40 }, () => 'Runtime evidence note: This paragraph exists to make report quality measurable while deterministic fixture text repeats the same sentence for mock-claim-1 using mock-source-1 and mock-counter-1.').join('\n\n'),
  '',
  '## Experiment / Validation Plan',
  'Runtime evidence note: This paragraph exists to make report quality measurable.',
  '',
  '## Limitations',
  'Runtime evidence note: This paragraph exists to make report quality measurable.',
  '',
  '## References',
  '- mock-source-1',
  '- mock-counter-1'
].join('\n\n')
await fsx.writeTextAtomic(path.join(dir, 'research-report.md'), `${repeated}\n`)
await fsx.rmrf(path.join(dir, 'research-final-review.codex.json'))
const gate = await research.evaluateResearchGate(dir)
const reasons = new Set(gate.reasons || [])

assertGate(gate.passed === false, 'template-like repeated report must be blocked', gate)
assertGate(reasons.has('research_report_repeated_paragraphs') || [...reasons].some((reason) => String(reason).startsWith('research_report_template_phrase_hit:Runtime evidence note')), 'missing repetition/template rejection reason', gate)

emitGate('research:template-report-rejection', { dir, reasons: gate.reasons })

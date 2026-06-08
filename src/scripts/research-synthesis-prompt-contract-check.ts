#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const prompt = await importDist('core/research/research-synthesis-prompt.js')

const text = prompt.buildResearchSynthesisPrompt({
  plan: { mission_id: 'M-SYNTHESIS-PROMPT', prompt: 'prompt contract check' },
  cycle: 1,
  sourceLedger: {
    sources: [{ id: 'source-1', layer: 'academic_literature', title: 'Source one', stance: 'supports', claim_ids: ['claim-1'] }],
    counterevidence_sources: [{ id: 'counter-1', layer: 'counterevidence_factcheck', title: 'Counter one', stance: 'undermines', claim_ids: ['claim-1'] }]
  },
  claimMatrix: { claims: [{ id: 'claim-1', claim: 'claim one', source_ids: ['source-1'], counterevidence_ids: ['counter-1'], test_or_probe: 'probe' }] },
  falsificationLedger: { cases: [{ id: 'falsification-1', target_claim: 'claim-1' }] },
  implementationBlueprint: { sections: [{ id: 'execution_plan', title: 'Execution Plan', target_paths: ['src/core/research/research-synthesis-writer.ts'], acceptance_checks: ['test'] }] },
  experimentPlan: { steps: [{ id: 'E1', action: 'run test' }] },
  replicationPack: { commands: ['npm run research:synthesis-writer'] }
})

for (const token of [
  'You are writing the final SKS Research synthesis.',
  'Do not write a short summary.',
  'Do not pad with repeated paragraphs.',
  'Every key claim must cite source-ledger ids.',
  'Every recommendation must point to implementation-blueprint sections.',
  'Every limitation must point to falsification-ledger cases or source blockers.',
  'Return JSON only matching sks.research-synthesis-output.v1.',
  'Do not modify repository source.',
  'If evidence is insufficient, return blockers rather than confident prose.',
  'source-1',
  'counter-1',
  'claim-1',
  'execution_plan',
  'npm run research:synthesis-writer'
]) assertGate(text.includes(token), `synthesis prompt missing token: ${token}`)

emitGate('research:synthesis-prompt-contract', { chars: text.length })

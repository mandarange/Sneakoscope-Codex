#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist, readText } from './lib/codex-sdk-gate-lib.js'

const researchCommand = readText('src/core/commands/research-command.ts')
assertGate(researchCommand.includes("backend: mock ? 'fake' : 'codex-sdk'"), 'Research pipeline must default native agents to codex-sdk')
assertGate(researchCommand.includes("flag(args, '--autoresearch') ? '$AutoResearch' : '$Research'"), 'Research/AutoResearch route selection missing')
assertGate(researchCommand.includes('narutoWorkGraph: researchWorkGraph'), 'Research pipeline must pass the stage-aware Naruto work graph')
assertGate(researchCommand.includes('readonly: true'), 'Research pipeline must force read-only native orchestration')
assertGate(researchCommand.includes('quality_metrics'), 'Research pipeline JSON output must include quality metrics')
assertGate(researchCommand.includes('const cycleResult = await runResearchCycle({'), 'Research default path must use runResearchCycle')
assertGate(researchCommand.includes('--legacy-research-cycle'), 'Legacy final.md loop must be opt-in only')

const researchCore = readText('src/core/research.ts')
assertGate(researchCore.includes('readResearchQualityContract'), 'Research gate must read research-quality-contract.json')
assertGate(researchCore.includes('claim_evidence_matrix_missing'), 'Research gate must require claim-evidence-matrix.json')
assertGate(researchCore.includes('research_final_review_not_approved'), 'Research gate must require final reviewer approval')

for (const [file, tokens] of Object.entries({
  'src/core/research/research-work-graph.ts': ['buildResearchWorkGraph', 'source_shard_academic_literature'],
  'src/core/research/research-cycle-runner.ts': ['runResearchCycle', 'Promise.race'],
  'src/core/research/research-final-reviewer.ts': ['runResearchCodexFinalReviewer'],
  'src/core/research/claim-evidence-matrix.ts': ['claim-evidence-matrix'],
  'src/core/research/implementation-blueprint.ts': ['implementation-blueprint'],
  'src/core/research/research-quality-contract.ts': ['research-quality-contract']
})) {
  const text = readText(file)
  for (const token of tokens) assertGate(text.includes(token), `${file} missing token ${token}`)
}

const research = await importDist('core/research.js')
const fsx = await importDist('core/fsx.js')
const dirShort = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-codex-research-short-'))
const planShort = await research.writeResearchPlan(dirShort, 'codex sdk short rejection fixture', { missionId: 'M-CODEX-SHORT' })
await fsx.writeTextAtomic(path.join(dirShort, 'research-report.md'), `# Short Report\n\n${Array.from({ length: 300 }, (_unused, index) => `word${index}`).join(' ')}\n`)
await fsx.writeJsonAtomic(path.join(dirShort, 'source-ledger.json'), { schema_version: 1, web_search_passes: 1, source_layers: [], sources: [], counterevidence_sources: [], triangulation: { cross_layer_checks: [] }, citation_coverage: { all_key_claims_cited: false }, blockers: [] })
await fsx.writeJsonAtomic(path.join(dirShort, 'implementation-blueprint.json'), { schema: 'sks.research-implementation-blueprint.v1', sections: [] })
const shortGate = await research.evaluateResearchGate(dirShort)
assertGate(shortGate.passed === false, 'codex-sdk research pipeline must reject short report fixture', shortGate)
assertGate((shortGate.reasons || []).includes('research_report_too_short'), 'short rejection must include report length reason', shortGate)

const dirComplete = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-codex-research-complete-'))
const planComplete = await research.writeResearchPlan(dirComplete, 'codex sdk complete package fixture', { missionId: 'M-CODEX-COMPLETE' })
const completeGate = await research.writeMockResearchResult(dirComplete, planComplete)
assertGate(completeGate.passed === true, 'codex-sdk research pipeline must pass complete package fixture', completeGate)
assertGate(completeGate.metrics?.final_review_approved === true, 'complete package must include approved final review', completeGate.metrics)

emitGate('codex-sdk:research-pipeline', { route: '$Research', short_dir: dirShort, complete_dir: dirComplete })

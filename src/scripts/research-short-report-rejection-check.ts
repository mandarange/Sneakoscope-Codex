#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')
const fsx = await importDist('core/fsx.js')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-short-report-'))
const plan = await research.writeResearchPlan(dir, 'short report rejection blackbox', { missionId: 'M-SHORT-REPORT' })
await fsx.writeTextAtomic(path.join(dir, 'research-report.md'), `# Short Report\n\n${Array.from({ length: 300 }, (_unused, index) => `word${index}`).join(' ')}\n`)
await fsx.writeJsonAtomic(path.join(dir, 'source-ledger.json'), {
  schema_version: 1,
  web_search_passes: 1,
  source_layers: [{ id: 'academic_literature', label: 'Academic literature', required: true, status: 'covered', source_ids: ['short-source-1'], counterevidence_ids: [] }],
  sources: [{
    id: 'short-source-1',
    layer: 'academic_literature',
    kind: 'fixture',
    title: 'One source',
    locator: 'fixture://one',
    publisher_or_author: 'fixture',
    accessed_at: new Date().toISOString(),
    reliability: 'low',
    credibility: 'thin',
    stance: 'supports',
    claim_ids: ['short-claim-1'],
    notes: 'Only one source should not satisfy the research quality contract.'
  }],
  counterevidence_sources: [],
  triangulation: { cross_layer_checks: [], conflicts: [], synthesis_notes: [] },
  citation_coverage: { all_key_claims_cited: false, key_claim_ids: ['short-claim-1'], cited_claim_ids: ['short-claim-1'], uncited_claim_ids: [], source_claim_map: { 'short-source-1': ['short-claim-1'] } },
  blockers: []
})
await fsx.writeJsonAtomic(path.join(dir, 'claim-evidence-matrix.json'), { schema: 'sks.claim-evidence-matrix.v1', mission_id: plan.mission_id, claims: [], key_claim_ids: [], unsupported_claims: [], triangulated_claim_count: 0, blockers: [] })
await fsx.writeJsonAtomic(path.join(dir, 'implementation-blueprint.json'), { schema: 'sks.research-implementation-blueprint.v1', sections: [] })
await fsx.rmrf(path.join(dir, 'research-final-review.codex.json'))

const gate = await research.evaluateResearchGate(dir)
const reasons = new Set(gate.reasons || [])
assertGate(gate.passed === false, 'summary-only package must be blocked', gate)
for (const reason of ['research_report_too_short', 'source_entries_below_research_quality_contract', 'key_claims_below_contract', 'research_final_review_not_approved']) {
  assertGate(reasons.has(reason), `missing rejection reason: ${reason}`, gate)
}
assertGate(reasons.has('implementation_blueprint_incomplete_sections') || reasons.has('implementation_blueprint_missing') || reasons.has('implementation_blueprint_sections_below_contract'), 'missing blueprint rejection reason', gate)

emitGate('research:short-report-rejection', { dir, reasons: gate.reasons })

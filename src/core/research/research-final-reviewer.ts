import path from 'node:path'
import { nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'
import { analyzeResearchReportQuality } from './research-report-quality.js'
import { validateClaimEvidenceMatrix } from './claim-evidence-matrix.js'
import { validateImplementationBlueprint } from './implementation-blueprint.js'
import { validateExperimentPlan } from './experiment-plan.js'
import { validateReplicationPack } from './replication-pack.js'
import { validateFalsificationCoverage } from './falsification.js'

export const RESEARCH_FINAL_REVIEW_ARTIFACT = 'research-final-review.json'

export async function readResearchFinalReview(dir: string) {
  return readJson(path.join(dir, RESEARCH_FINAL_REVIEW_ARTIFACT), null)
}

export async function runResearchFinalReviewer(dir: string, input: any = {}) {
  const contract = input.contract || await readJson(path.join(dir, 'research-quality-contract.json'), null)
  const sourceLedger = input.sourceLedger || await readJson(path.join(dir, 'source-ledger.json'), null)
  const claimMatrix = input.claimMatrix || await readJson(path.join(dir, 'claim-evidence-matrix.json'), null)
  const blueprint = input.blueprint || await readJson(path.join(dir, 'implementation-blueprint.json'), null)
  const experimentPlan = input.experimentPlan || await readJson(path.join(dir, 'experiment-plan.json'), null)
  const replicationPack = input.replicationPack || await readJson(path.join(dir, 'replication-pack.json'), null)
  const falsificationLedger = input.falsificationLedger || await readJson(path.join(dir, 'falsification-ledger.json'), null)
  const reportText = input.reportText || await readText(path.join(dir, 'research-report.md'), '')
  const claimValidation = validateClaimEvidenceMatrix(claimMatrix, sourceLedger, falsificationLedger)
  const blueprintValidation = validateImplementationBlueprint(blueprint, contract)
  const experimentValidation = validateExperimentPlan(experimentPlan, contract)
  const replicationValidation = validateReplicationPack(replicationPack)
  const falsificationValidation = validateFalsificationCoverage(falsificationLedger, contract)
  const reportQuality = analyzeResearchReportQuality(reportText)
  const preliminaryReasons = Array.isArray(input.preliminaryReasons) ? input.preliminaryReasons : []
  const blockers = [
    ...preliminaryReasons,
    ...claimValidation.blockers,
    ...blueprintValidation.blockers,
    ...experimentValidation.blockers,
    ...replicationValidation.blockers,
    ...falsificationValidation.blockers,
    ...reportQuality.blockers
  ]
  const uniqueBlockers = [...new Set(blockers)]
  const review = {
    schema: 'sks.research-final-reviewer.v1',
    reviewed_at: nowIso(),
    approved: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    contract_summary: contract || null,
    checks: {
      claim_matrix: claimValidation,
      implementation_blueprint: blueprintValidation,
      experiment_plan: experimentValidation,
      replication_pack: replicationValidation,
      falsification: falsificationValidation,
      report_quality: reportQuality
    },
    reviewer: 'research_final_reviewer_static_gate'
  }
  await writeJsonAtomic(path.join(dir, RESEARCH_FINAL_REVIEW_ARTIFACT), review)
  return review
}

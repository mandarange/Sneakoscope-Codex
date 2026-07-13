import path from 'node:path'
import { nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'
import { analyzeResearchReportQuality } from './research-report-quality.js'
import { validateClaimEvidenceMatrix } from './claim-evidence-matrix.js'
import { validateImplementationBlueprint } from './implementation-blueprint.js'
import { validateExperimentPlan } from './experiment-plan.js'
import { validateReplicationPack } from './replication-pack.js'
import { validateFalsificationCoverage } from './falsification.js'
import {
  RESEARCH_ADVERSARIAL_REVIEW_ARTIFACT,
  RESEARCH_CONVERGENCE_GATE_ARTIFACT
} from './research-adversarial-review.js'

export const RESEARCH_FINAL_REVIEW_ARTIFACT = 'research-final-review.json'
export const RESEARCH_STATIC_FINAL_REVIEW_ARTIFACT = 'research-final-review.static.json'
export const RESEARCH_CODEX_FINAL_REVIEW_ARTIFACT = 'research-final-review.codex.json'

export async function readResearchFinalReview(dir: string) {
  return readJson(path.join(dir, RESEARCH_FINAL_REVIEW_ARTIFACT), null)
}

export async function runResearchStaticFinalReview(dir: string, input: any = {}) {
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
  await writeJsonAtomic(path.join(dir, RESEARCH_STATIC_FINAL_REVIEW_ARTIFACT), review)
  return review
}

export async function runResearchCodexFinalReviewer(input: {
  root: string
  dir: string
  plan: any
  staticReview: any
  backendPreference?: Array<'codex-sdk' | 'python-codex-sdk'>
  timeoutMs?: number
  mock?: boolean
}): Promise<any> {
  if (input.staticReview?.approved !== true) {
    const skipped = {
      schema: 'sks.research-codex-final-review.v1',
      reviewed_at: nowIso(),
      verdict: 'revise',
      unsupported_claim_ids: [],
      missing_evidence: [],
      blueprint_findings: [],
      falsification_findings: [],
      template_like_prose: true,
      source_density_ok: false,
      implementation_concreteness_ok: false,
      evidence_bound_synthesis_ok: false,
      required_revisions: ['static_review_failed'],
      confidence: 'low',
      skipped: true,
      skip_reason: 'static_review_failed'
    }
    await writeJsonAtomic(path.join(input.dir, RESEARCH_CODEX_FINAL_REVIEW_ARTIFACT), skipped)
    return skipped
  }
  const convergence = await readJson<any>(path.join(input.dir, RESEARCH_CONVERGENCE_GATE_ARTIFACT), null)
  const ledger = await readJson<any>(path.join(input.dir, RESEARCH_ADVERSARIAL_REVIEW_ARTIFACT), null)
  const finalCycle = Array.isArray(ledger?.review_cycles) ? ledger.review_cycles.at(-1) : null
  const reviewers = Array.isArray(finalCycle?.reviewers) ? finalCycle.reviewers : []
  const objections = reviewers.flatMap((reviewer: any) => [
    ...(Array.isArray(reviewer?.critical_objections) ? reviewer.critical_objections : []),
    ...(Array.isArray(reviewer?.major_objections) ? reviewer.major_objections : [])
  ])
  const requiredRevisions = [...new Set([
    ...reviewers.flatMap((reviewer: any) => Array.isArray(reviewer?.required_revisions) ? reviewer.required_revisions : []),
    ...objections.map((objection: any) => objection?.required_revision).filter(Boolean),
    ...(Array.isArray(convergence?.blockers) ? convergence.blockers : [])
  ].map(String))]
  const approved = convergence?.passed === true
  const review = {
    schema: 'sks.research-codex-final-review.v1',
    reviewed_at: nowIso(),
    verdict: approved ? 'approve' : 'revise',
    unsupported_claim_ids: [...new Set(objections.flatMap((objection: any) => Array.isArray(objection?.claim_ids) ? objection.claim_ids.map(String) : []))],
    missing_evidence: objections.filter((objection: any) => !Array.isArray(objection?.source_ids) || objection.source_ids.length === 0).map((objection: any) => String(objection?.id || 'unknown')),
    blueprint_findings: approved ? ['official subagent reviewers accepted the evidence-bound implementation handoff'] : [],
    falsification_findings: reviewers.map((reviewer: any) => String(reviewer?.strongest_challenge || '')).filter(Boolean),
    template_like_prose: objections.some((objection: any) => /template|boilerplate|repet/i.test(String(objection?.reason || ''))),
    source_density_ok: approved,
    implementation_concreteness_ok: input.staticReview?.checks?.implementation_blueprint?.ok === true,
    evidence_bound_synthesis_ok: approved,
    required_revisions: requiredRevisions,
    confidence: approved ? 'high' : reviewers.length ? 'medium' : 'low',
    official_subagent_review: true,
    reviewer_count: reviewers.length,
    review_cycles: Number(convergence?.review_cycles || 0),
    unresolved_critical_objections: Number(convergence?.unresolved_critical_objections || 0),
    ...(input.mock === true ? { mock: true } : {})
  }
  await writeJsonAtomic(path.join(input.dir, RESEARCH_CODEX_FINAL_REVIEW_ARTIFACT), review)
  return review
}

export async function runResearchFinalReviewer(dir: string, input: any = {}) {
  const staticReview = await runResearchStaticFinalReview(dir, input)
  const existingCodex = await readJson(path.join(dir, RESEARCH_CODEX_FINAL_REVIEW_ARTIFACT), null)
  const codexReview = existingCodex || await runResearchCodexFinalReviewer({
    root: input.root || process.cwd(),
    dir,
    plan: input.plan || await readJson(path.join(dir, 'research-plan.json'), null),
    staticReview,
    mock: input.mock === true
  })
  const adversarialGate = await readJson<any>(path.join(dir, RESEARCH_CONVERGENCE_GATE_ARTIFACT), null)
  const codexApproved = codexReview?.verdict === 'approve'
  const codexRequired = input.codexRequired !== false
  const blockers = [
    ...(Array.isArray(staticReview?.blockers) ? staticReview.blockers : []),
    ...(codexRequired && !codexReview ? ['research_codex_final_review_missing'] : []),
    ...(codexReview && !codexApproved ? ['research_codex_final_review_not_approved'] : []),
    ...(codexReview?.template_like_prose === true ? ['research_codex_template_like_prose'] : []),
    ...(codexReview && codexReview.source_density_ok === false ? ['research_codex_source_density_not_ok'] : []),
    ...(codexReview && codexReview.implementation_concreteness_ok === false ? ['research_codex_implementation_concreteness_not_ok'] : []),
    ...(codexReview && codexReview.evidence_bound_synthesis_ok === false ? ['research_codex_evidence_bound_synthesis_not_ok'] : []),
    ...(Array.isArray(codexReview?.required_revisions) ? codexReview.required_revisions.map((revision: any) => `codex_revision:${revision}`) : []),
    ...(adversarialGate?.passed === true ? [] : ['research_adversarial_convergence_not_passed'])
  ]
  const review = {
    schema: 'sks.research-final-reviewer.v2',
    reviewed_at: nowIso(),
    approved: staticReview?.approved === true && adversarialGate?.passed === true && (!codexRequired || codexApproved) && blockers.length === 0,
    blockers: [...new Set(blockers)],
    static_review: staticReview,
    codex_review: codexReview,
    adversarial_convergence: adversarialGate,
    reviewer: 'research_final_reviewer_static_plus_official_subagents'
  }
  await writeJsonAtomic(path.join(dir, RESEARCH_FINAL_REVIEW_ARTIFACT), review)
  return review
}

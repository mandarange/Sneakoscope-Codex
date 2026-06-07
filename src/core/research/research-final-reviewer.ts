import path from 'node:path'
import { nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'
import { runCodexTask } from '../codex-control/codex-task-runner.js'
import { analyzeResearchReportQuality } from './research-report-quality.js'
import { validateClaimEvidenceMatrix } from './claim-evidence-matrix.js'
import { validateImplementationBlueprint } from './implementation-blueprint.js'
import { validateExperimentPlan } from './experiment-plan.js'
import { validateReplicationPack } from './replication-pack.js'
import { validateFalsificationCoverage } from './falsification.js'

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
      required_revisions: ['static_review_failed'],
      confidence: 'low',
      skipped: true,
      skip_reason: 'static_review_failed'
    }
    await writeJsonAtomic(path.join(input.dir, RESEARCH_CODEX_FINAL_REVIEW_ARTIFACT), skipped)
    return skipped
  }
  if (input.mock === true) {
    const approved = {
      schema: 'sks.research-codex-final-review.v1',
      reviewed_at: nowIso(),
      verdict: 'approve',
      unsupported_claim_ids: [],
      missing_evidence: [],
      blueprint_findings: ['mock final reviewer approves the complete package fixture'],
      falsification_findings: ['mock counterevidence and falsification cases are present'],
      required_revisions: [],
      confidence: 'high',
      mock: true
    }
    await writeJsonAtomic(path.join(input.dir, RESEARCH_CODEX_FINAL_REVIEW_ARTIFACT), approved)
    return approved
  }
  const result = await runCodexTask({
    route: '$Research',
    tier: 'worker',
    missionId: String(input.plan?.mission_id || 'research-final-review'),
    workItemId: 'research_final_review',
    cwd: input.root,
    prompt: buildResearchFinalReviewPrompt(input.plan, input.staticReview),
    outputSchema: researchCodexFinalReviewSchema,
    outputSchemaId: 'sks.research-codex-final-review.v1',
    sandboxPolicy: 'read-only',
    requestedScopeContract: {
      id: 'research-final-review',
      route: '$Research',
      read_only: true,
      allowed_paths: [`.sneakoscope/missions/${input.plan?.mission_id || ''}/`],
      write_paths: [],
      allowed_write_prefixes: [`.sneakoscope/missions/${input.plan?.mission_id || ''}/`],
      source_mutation_allowed: false
    },
    backendPreference: input.backendPreference || ['codex-sdk', 'python-codex-sdk'],
    localLlmPolicy: { mode: 'disabled', requiresGptFinal: true },
    allowLocalLlm: false,
    mutationLedgerRoot: path.join(input.dir, 'research', 'final-review-codex-control'),
    reliabilityPolicy: {
      timeoutClass: 'standard',
      idleTimeoutMs: input.timeoutMs || 120000
    }
  })
  const worker = await readJson(result.workerResultPath, null)
  const review = normalizeCodexReview(worker, result)
  await writeJsonAtomic(path.join(input.dir, RESEARCH_CODEX_FINAL_REVIEW_ARTIFACT), review)
  return review
}

export async function runResearchFinalReviewer(dir: string, input: any = {}) {
  const staticReview = await runResearchStaticFinalReview(dir, input)
  const existingCodex = await readJson(path.join(dir, RESEARCH_CODEX_FINAL_REVIEW_ARTIFACT), null)
  const codexReview = existingCodex || (input.mock === true ? await runResearchCodexFinalReviewer({
    root: input.root || process.cwd(),
    dir,
    plan: input.plan || await readJson(path.join(dir, 'research-plan.json'), null),
    staticReview,
    mock: true
  }) : null)
  const codexApproved = codexReview?.verdict === 'approve'
  const codexRequired = input.codexRequired !== false
  const blockers = [
    ...(Array.isArray(staticReview?.blockers) ? staticReview.blockers : []),
    ...(codexRequired && !codexReview ? ['research_codex_final_review_missing'] : []),
    ...(codexReview && !codexApproved ? ['research_codex_final_review_not_approved'] : []),
    ...(Array.isArray(codexReview?.required_revisions) ? codexReview.required_revisions.map((revision: any) => `codex_revision:${revision}`) : [])
  ]
  const review = {
    schema: 'sks.research-final-reviewer.v2',
    reviewed_at: nowIso(),
    approved: staticReview?.approved === true && (!codexRequired || codexApproved) && blockers.length === 0,
    blockers: [...new Set(blockers)],
    static_review: staticReview,
    codex_review: codexReview,
    reviewer: 'research_final_reviewer_static_plus_codex_gate'
  }
  await writeJsonAtomic(path.join(dir, RESEARCH_FINAL_REVIEW_ARTIFACT), review)
  return review
}

function buildResearchFinalReviewPrompt(plan: any, staticReview: any): string {
  return [
    'You are the Codex/GPT final reviewer for an SKS Research package.',
    `Mission: ${plan?.mission_id || 'unknown'}`,
    `Prompt: ${plan?.prompt || ''}`,
    '',
    'Review the mission artifacts read-only. Reject if claims lack evidence, blueprint steps are template-like, falsification is missing, or the package is only a short summary.',
    'Return only JSON matching sks.research-codex-final-review.v1 with verdict approve, revise, or reject.',
    '',
    `Static review summary:\n${JSON.stringify(staticReview, null, 2).slice(0, 12000)}`
  ].join('\n')
}

function normalizeCodexReview(worker: any, result: any) {
  if (!result?.ok) {
    return {
      schema: 'sks.research-codex-final-review.v1',
      reviewed_at: nowIso(),
      verdict: 'revise',
      unsupported_claim_ids: [],
      missing_evidence: [],
      blueprint_findings: [],
      falsification_findings: [],
      required_revisions: Array.isArray(result?.blockers) ? result.blockers : ['codex_final_reviewer_unavailable'],
      confidence: 'low',
      worker_result_path: result?.workerResultPath || null
    }
  }
  return {
    schema: 'sks.research-codex-final-review.v1',
    reviewed_at: nowIso(),
    verdict: ['approve', 'revise', 'reject'].includes(worker?.verdict) ? worker.verdict : 'revise',
    unsupported_claim_ids: Array.isArray(worker?.unsupported_claim_ids) ? worker.unsupported_claim_ids.map(String) : [],
    missing_evidence: Array.isArray(worker?.missing_evidence) ? worker.missing_evidence.map(String) : [],
    blueprint_findings: Array.isArray(worker?.blueprint_findings) ? worker.blueprint_findings.map(String) : [],
    falsification_findings: Array.isArray(worker?.falsification_findings) ? worker.falsification_findings.map(String) : [],
    required_revisions: Array.isArray(worker?.required_revisions) ? worker.required_revisions.map(String) : [],
    confidence: ['low', 'medium', 'high'].includes(worker?.confidence) ? worker.confidence : 'medium',
    worker_result_path: result.workerResultPath
  }
}

export const researchCodexFinalReviewSchema = {
  type: 'object',
  required: ['schema', 'verdict', 'unsupported_claim_ids', 'missing_evidence', 'blueprint_findings', 'falsification_findings', 'required_revisions', 'confidence'],
  properties: {
    schema: { const: 'sks.research-codex-final-review.v1' },
    verdict: { enum: ['approve', 'revise', 'reject'] },
    unsupported_claim_ids: { type: 'array' },
    missing_evidence: { type: 'array' },
    blueprint_findings: { type: 'array' },
    falsification_findings: { type: 'array' },
    required_revisions: { type: 'array' },
    confidence: { enum: ['low', 'medium', 'high'] }
  }
}

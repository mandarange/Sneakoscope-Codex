import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const EXPERIMENT_PLAN_JSON_ARTIFACT = 'experiment-plan.json'
export const EXPERIMENT_PLAN_MARKDOWN_ARTIFACT = 'experiment-plan.md'

export function defaultExperimentPlan(plan: any = null, opts: { claimMatrix?: any; sourceLedger?: any } = {}) {
  const prompt = String(plan?.prompt || 'research mission')
  const claims = Array.isArray(opts.claimMatrix?.claims) ? opts.claimMatrix.claims : []
  const primaryClaim = claims.find((claim: any) => claim.importance === 'critical' || claim.importance === 'high') || claims[0]
  const hypothesis = String(primaryClaim?.claim || prompt).trim()
  const primaryClaimId = String(primaryClaim?.id || 'primary-hypothesis')
  return {
    schema: 'sks.research-experiment-plan.v1',
    generated_at: nowIso(),
    prompt,
    hypothesis: `Under the stated boundary conditions, the evidence-backed claim “${hypothesis}” should produce an observable result that distinguishes it from a simpler alternative explanation.`,
    steps: [
      { id: 'E1', action: `Operationalize ${primaryClaimId}: define the measurable outcome, units or decision rule, population/system boundary, and the observation window.`, expected_evidence: ['claim-evidence-matrix.json'] },
      { id: 'E2', action: 'Choose a baseline or null explanation that could plausibly produce the same observation, and record confounders before collecting results.', expected_evidence: ['falsification-ledger.json'] },
      { id: 'E3', action: 'Reproduce the strongest supporting evidence with the same inputs or an explicitly documented equivalent data source.', expected_evidence: ['source-ledger.json'] },
      { id: 'E4', action: 'Run the cheapest decisive falsification probe and preserve negative, null, or contradictory outcomes instead of filtering them out.', expected_evidence: ['falsification-ledger.json'] },
      { id: 'E5', action: 'Compare the observation with the acceptance threshold, update confidence, and publish the procedure, artifacts, and unresolved limitations for independent replication.', expected_evidence: ['replication-pack.json', 'research-report.md'] }
    ],
    metrics: ['primary_outcome', 'effect_or_difference_from_baseline', 'uncertainty_interval_or_decision_margin', 'replication_success', 'falsification_result'],
    controls: ['explicit_null_or_baseline', 'same_boundary_conditions', 'counterevidence_preserved'],
    acceptance_threshold: `Retain ${primaryClaimId} only if the decisive observation exceeds the predeclared decision margin, survives the recorded counterevidence, and is independently reproducible; otherwise downgrade or reject it.`
  }
}

export function validateExperimentPlan(experimentPlan: any = null, contract: any = null) {
  const minSteps = Number(contract?.min_experiment_steps || 5)
  const steps = Array.isArray(experimentPlan?.steps) ? experimentPlan.steps : []
  const completeSteps = steps.filter((step: any) => String(step?.id || '').trim() && String(step?.action || '').trim())
  const blockers = [
    ...(experimentPlan ? [] : ['experiment_plan_missing']),
    ...(steps.length < minSteps ? ['experiment_plan_steps_below_contract'] : []),
    ...(completeSteps.length < minSteps ? ['experiment_plan_too_thin'] : [])
  ]
  return { ok: blockers.length === 0, blockers, steps: steps.length, complete_steps: completeSteps.length, min_steps: minSteps }
}

export function renderExperimentPlanMarkdown(experimentPlan: any = null) {
  const lines = ['# Research Experiment Plan', '', `Hypothesis: ${experimentPlan?.hypothesis || ''}`, '', '## Steps']
  for (const step of Array.isArray(experimentPlan?.steps) ? experimentPlan.steps : []) {
    lines.push(`- ${step.id}: ${step.action}`)
  }
  lines.push('', '## Metrics')
  for (const metric of Array.isArray(experimentPlan?.metrics) ? experimentPlan.metrics : []) lines.push(`- ${metric}`)
  return `${lines.join('\n')}\n`
}

export async function readExperimentPlan(dir: string) {
  return readJson(path.join(dir, EXPERIMENT_PLAN_JSON_ARTIFACT), null)
}

export async function writeExperimentPlan(dir: string, experimentPlan: any) {
  await writeJsonAtomic(path.join(dir, EXPERIMENT_PLAN_JSON_ARTIFACT), experimentPlan)
  await writeTextAtomic(path.join(dir, EXPERIMENT_PLAN_MARKDOWN_ARTIFACT), renderExperimentPlanMarkdown(experimentPlan))
  return experimentPlan
}

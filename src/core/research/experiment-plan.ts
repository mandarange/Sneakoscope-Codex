import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const EXPERIMENT_PLAN_JSON_ARTIFACT = 'experiment-plan.json'
export const EXPERIMENT_PLAN_MARKDOWN_ARTIFACT = 'experiment-plan.md'

export function defaultExperimentPlan(plan: any = null) {
  const prompt = String(plan?.prompt || 'research mission')
  return {
    schema: 'sks.research-experiment-plan.v1',
    generated_at: nowIso(),
    prompt,
    hypothesis: 'The surviving research claim should produce a measurable improvement over a summary-only baseline.',
    steps: [
      { id: 'E1', action: 'Select one baseline output and one research-pipeline output for the same prompt.', expected_evidence: ['research-report.md'] },
      { id: 'E2', action: 'Score cited key claims, triangulation, counterevidence, and unsupported claims.', expected_evidence: ['claim-evidence-matrix.json'] },
      { id: 'E3', action: 'Run or design the smallest probe implied by the implementation blueprint.', expected_evidence: ['implementation-blueprint.json'] },
      { id: 'E4', action: 'Compare failure cases and falsification outcomes.', expected_evidence: ['falsification-ledger.json'] },
      { id: 'E5', action: 'Record replication commands, artifacts, and acceptance thresholds.', expected_evidence: ['replication-pack.json'] }
    ],
    metrics: ['key_claims_supported', 'triangulated_claims', 'counterevidence_sources', 'falsification_cases', 'experiment_steps'],
    controls: ['summary_only_baseline', 'same_prompt_same_context'],
    acceptance_threshold: 'All quality-contract thresholds are met and the final reviewer approves the run.'
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

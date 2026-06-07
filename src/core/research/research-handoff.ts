import path from 'node:path'
import { nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const IMPLEMENTATION_HANDOFF_PATCH_PLAN_ARTIFACT = 'implementation-handoff.patch-plan.json'
export const TEAM_HANDOFF_GOAL_ARTIFACT = 'team-handoff-goal.md'
export const DECISION_LOG_ARTIFACT = 'decision-log.md'

export async function writeResearchHandoffArtifacts(dir: string, plan: any = null, blueprint: any = null) {
  const patchPlan = {
    schema: 'sks.research-implementation-handoff-patch-plan.v1',
    generated_at: nowIso(),
    mission_id: plan?.mission_id || null,
    implementation_allowed_in_research: false,
    intended_route: '$Team',
    prompt: plan?.prompt || '',
    source_artifacts: [
      'research-report.md',
      'claim-evidence-matrix.json',
      'implementation-blueprint.json',
      'experiment-plan.json',
      'replication-pack.json',
      'source-quality-report.json'
    ],
    proposed_changes: [],
    notes: [
      'This is a handoff artifact. Research records implementation guidance but does not mutate repository source.'
    ]
  }
  const goalLines = [
    '# Research-To-Team Handoff Goal',
    '',
    `Mission: ${plan?.mission_id || 'unknown'}`,
    `Prompt: ${plan?.prompt || ''}`,
    '',
    'Use the implementation blueprint, claim-evidence matrix, source-quality report, experiment plan, replication pack, and final reviewer output before changing code.',
    '',
    'Blueprint sections:',
    ...(Array.isArray(blueprint?.sections) ? blueprint.sections.map((section: any) => `- ${section.id}: ${section.title}`) : [])
  ]
  const decisionLog = [
    '# Research Decision Log',
    '',
    `Created: ${nowIso()}`,
    '',
    '- Research may write route-local artifacts only.',
    '- Implementation decisions must be revalidated in the follow-up execution route.'
  ]
  await writeJsonAtomic(path.join(dir, IMPLEMENTATION_HANDOFF_PATCH_PLAN_ARTIFACT), patchPlan)
  await writeTextAtomic(path.join(dir, TEAM_HANDOFF_GOAL_ARTIFACT), `${goalLines.join('\n')}\n`)
  await writeTextAtomic(path.join(dir, DECISION_LOG_ARTIFACT), `${decisionLog.join('\n')}\n`)
  return { patch_plan: patchPlan, goal_artifact: TEAM_HANDOFF_GOAL_ARTIFACT, decision_log: DECISION_LOG_ARTIFACT }
}

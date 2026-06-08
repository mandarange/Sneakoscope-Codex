import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const IMPLEMENTATION_HANDOFF_PATCH_PLAN_ARTIFACT = 'implementation-handoff.patch-plan.json'
export const TEAM_HANDOFF_GOAL_ARTIFACT = 'team-handoff-goal.md'
export const DECISION_LOG_ARTIFACT = 'decision-log.md'

export async function writeResearchHandoffArtifacts(dir: string, plan: any = null, blueprint: any = null) {
  const claimMatrix = await readJson(path.join(dir, 'claim-evidence-matrix.json'), null)
  const sourceLedger = await readJson(path.join(dir, 'source-ledger.json'), null)
  const claims = Array.isArray(claimMatrix?.claims) ? claimMatrix.claims : []
  const sourceRows = [
    ...(Array.isArray(sourceLedger?.sources) ? sourceLedger.sources : []),
    ...(Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources : [])
  ]
  const workItems = parallelWorkItems(blueprint)
  const patchPlan = {
    schema: 'sks.research-implementation-handoff-patch-plan.v1',
    generated_at: nowIso(),
    mission_id: plan?.mission_id || null,
    implementation_allowed_in_research: false,
    intended_route: '$Naruto',
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
    parallel_work_items: workItems,
    notes: [
      'This is a handoff artifact. Research records implementation guidance but does not mutate repository source.'
    ]
  }
  const goalLines = [
    '# Research-To-Naruto Handoff Goal',
    '',
    '## Context',
    '',
    `Mission: ${plan?.mission_id || 'unknown'}`,
    `Prompt: ${plan?.prompt || ''}`,
    'Route: Use `$Naruto` for implementation, integration, and parallel non-overlapping lanes.',
    '',
    'Use the implementation blueprint, claim-evidence matrix, source-quality report, experiment plan, replication pack, and final reviewer output before changing code.',
    '',
    '## Key Claims',
    '',
    ...(claims.length ? claims.slice(0, 8).map((claim: any) => `- ${claim.id}: ${claim.claim} Sources: ${normalizeList(claim.source_ids).join(', ') || 'explicit blocker: source ids missing'}. Counterevidence: ${normalizeList(claim.counterevidence_ids).join(', ') || 'explicit blocker: counterevidence missing'}.`) : ['- explicit blocker: claim-evidence-matrix.json has no claim rows.']),
    '',
    '## Evidence Summary',
    '',
    `- Source rows: ${sourceRows.length}.`,
    `- Key claims: ${Array.isArray(claimMatrix?.key_claim_ids) ? claimMatrix.key_claim_ids.length : 0}.`,
    `- Counterevidence rows: ${Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources.length : 0}.`,
    '- Read `source-quality-report.json` and `research-final-review.json` before implementation.',
    '',
    '## Implementation Blueprint',
    '',
    ...(Array.isArray(blueprint?.sections) ? blueprint.sections.map((section: any) => `- ${section.id}: ${section.title}. Files: ${normalizeList(section.target_paths).join(', ') || 'explicit blocker: no target paths'}. Checks: ${normalizeList(section.acceptance_checks).join(' | ') || 'explicit blocker: no acceptance checks'}.`) : ['- explicit blocker: implementation-blueprint.json missing sections.']),
    '',
    '## Parallel Work Items',
    '',
    ...workItems.map((item: any, index: number) => `${index + 1}. ${item.title}. Files: ${item.files.length ? item.files.join(', ') : 'explicit blocker: file list missing'}. Tests: ${item.tests.length ? item.tests.join(', ') : 'explicit blocker: tests missing'}. Acceptance: ${item.acceptance}.`),
    '',
    '## Acceptance Tests',
    '',
    ...normalizeList(blueprint?.test_commands).map((command) => `- ${command}`),
    ...(normalizeList(blueprint?.test_commands).length ? [] : ['- explicit blocker: no test commands in implementation blueprint.']),
    '',
    '## Rollback Plan',
    '',
    ...normalizeList(blueprint?.rollback_steps).map((step) => `- ${step}`),
    ...(normalizeList(blueprint?.rollback_steps).length ? [] : ['- explicit blocker: no rollback steps in implementation blueprint.']),
    '',
    '## Source Appendix',
    '',
    ...sourceRows.slice(0, 20).map((source: any) => `- ${source.id}: ${source.title || source.locator || 'source row'}; claims=${normalizeList(source.claim_ids).join(', ') || 'none'}.`),
    ...(sourceRows.length ? [] : ['- explicit blocker: source-ledger.json has no source rows.'])
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

function parallelWorkItems(blueprint: any): any[] {
  const sections = Array.isArray(blueprint?.sections) ? blueprint.sections : []
  const fallbackFiles = normalizeList(blueprint?.existing_files).slice(0, 8)
  const tests = normalizeList(blueprint?.test_commands)
  const rows = normalizeList(blueprint?.parallel_work_decomposition)
  const source = rows.length >= 4 ? rows : ['Synthesis writer lane', 'Report quality lane', 'Final reviewer lane', 'Release and docs lane']
  return source.slice(0, Math.max(4, source.length)).map((title, index) => {
    const section = sections[index % Math.max(1, sections.length)] || {}
    const files = normalizeList(section.target_paths).length ? normalizeList(section.target_paths) : fallbackFiles.slice(index, index + 3)
    return {
      id: `handoff-work-${index + 1}`,
      title,
      files,
      tests: tests.slice(0, 3),
      acceptance: normalizeList(section.acceptance_checks).join(' | ') || 'Complete the lane and rerun the relevant research gate.'
    }
  })
}

function normalizeList(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item || '').trim()).filter(Boolean))]
}

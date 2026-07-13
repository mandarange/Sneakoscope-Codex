import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const IMPLEMENTATION_BLUEPRINT_ARTIFACT = 'implementation-blueprint.json'

const DEFAULT_SECTION_IDS = Object.freeze([
  'problem',
  'decision',
  'architecture',
  'interfaces',
  'data_contracts',
  'execution_plan',
  'verification_plan',
  'risks_and_rollbacks'
])

export function defaultImplementationBlueprint(plan: any = null) {
  const prompt = String(plan?.prompt || 'research mission')
  const existingFiles = [
    'research-plan.json',
    'source-ledger.json',
    'claim-evidence-matrix.json',
    'falsification-ledger.json',
    'research-report.md',
    researchArtifactName(plan)
  ]
  return {
    schema: 'sks.research-implementation-blueprint.v1',
    generated_at: nowIso(),
    prompt,
    implementation_allowed_in_research: false,
    handoff_route: 'research_validation',
    handoff_type: 'research_validation',
    repository_aware: false,
    domain_research: true,
    existing_files: existingFiles,
    possible_new_files: [],
    validation_targets: ['key claims', 'counterevidence', 'falsification outcomes', 'replication procedure'],
    test_commands: [
      'procedure: reproduce the primary evidence acquisition from source-ledger.json',
      'procedure: execute the cheapest decisive test from falsification-ledger.json',
      'procedure: compare the observed result with the claim-evidence matrix acceptance threshold'
    ],
    rollback_steps: [
      'Withdraw or downgrade any claim whose cited evidence cannot be reproduced.',
      'Restore the last source-linked manuscript snapshot and record the failed assumption.'
    ],
    parallel_work_decomposition: [
      'WS-A independently reproduce the strongest supporting evidence.',
      'WS-B independently reproduce the strongest counterevidence.',
      'WS-C execute or design the decisive falsification probe.',
      'WS-D audit citations, assumptions, and remaining uncertainty.'
    ],
    sections: DEFAULT_SECTION_IDS.map((id, index) => ({
      id,
      title: id.split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
      order: index + 1,
      detail: sectionDetail(id, prompt, existingFiles),
      evidence_claim_ids: [`claim-${(index % 8) + 1}`],
      target_paths: existingFiles.slice(0, 3 + (index % 3)),
      acceptance_checks: [`${id} is reviewed against cited source ids, claim ids, concrete files, and rollback evidence before implementation.`]
    })),
    dependencies: [],
    out_of_scope: ['Repository source mutation during $Research runs.'],
    open_questions: []
  }
}

export function validateImplementationBlueprint(blueprint: any = null, contract: any = null) {
  const minSections = Number(contract?.min_implementation_blueprint_sections || contract?.min_blueprint_sections || 8)
  const sections = Array.isArray(blueprint?.sections) ? blueprint.sections : []
  const completeSections = sections.filter((section: any) => {
    return String(section?.id || '').trim()
      && String(section?.title || '').trim()
      && String(section?.detail || '').trim()
      && Array.isArray(section?.acceptance_checks)
      && section.acceptance_checks.length > 0
  })
  const existingFiles = normalizeStringList(blueprint?.existing_files)
  const testCommands = normalizeStringList(blueprint?.test_commands)
  const rollbackSteps = normalizeStringList(blueprint?.rollback_steps)
  const parallelWork = normalizeStringList(blueprint?.parallel_work_decomposition)
  const thinSections = sections
    .filter((section: any) => String(section?.detail || '').trim().length < 120)
    .map((section: any) => String(section?.id || section?.title || 'unknown'))
  const executionPlan = sections.find((section: any) => String(section?.id || '').trim() === 'execution_plan' || /execution|step/i.test(String(section?.title || '')))
  const executionPlanHasNumberedSteps = /(?:^|\n)\s*(?:\d+\.|[-*]\s+\d+\.)\s+/.test(String(executionPlan?.detail || ''))
  const repositoryAware = blueprint?.repository_aware === true
  const domainResearch = blueprint?.domain_research === true || blueprint?.handoff_type === 'research_validation'
  const validationTargets = normalizeStringList(blueprint?.validation_targets)
  const blockers = [
    ...(blueprint ? [] : ['implementation_blueprint_missing']),
    ...(sections.length < minSections ? ['implementation_blueprint_sections_below_contract'] : []),
    ...(completeSections.length < minSections ? ['implementation_blueprint_incomplete_sections'] : []),
    ...(repositoryAware || domainResearch ? [] : ['implementation_blueprint_scope_missing']),
    ...(repositoryAware && !(existingFiles.length >= 3 && existingFiles.some((file) => /^src\/|^package\.json$|^release-gates|^docs\//.test(file))) ? ['implementation_blueprint_file_map_too_thin'] : []),
    ...(domainResearch && validationTargets.length < 3 ? ['implementation_blueprint_validation_targets_too_thin'] : []),
    ...(testCommands.length >= 3 ? [] : ['implementation_blueprint_test_plan_too_thin']),
    ...(rollbackSteps.length >= 2 ? [] : ['implementation_blueprint_rollback_too_thin']),
    ...(parallelWork.length >= 4 ? [] : ['implementation_blueprint_parallel_work_missing']),
    ...thinSections.map((id: string) => `implementation_blueprint_section_too_thin:${id}`),
    ...(executionPlanHasNumberedSteps ? [] : ['implementation_blueprint_execution_plan_not_numbered'])
  ]
  return {
    ok: blockers.length === 0,
    blockers,
    sections: sections.length,
    complete_sections: completeSections.length,
    min_sections: minSections,
    existing_files: existingFiles.length,
    test_commands: testCommands.length,
    rollback_steps: rollbackSteps.length,
    parallel_work_items: parallelWork.length,
    thin_sections: thinSections
  }
}

export async function readImplementationBlueprint(dir: string) {
  return readJson(path.join(dir, IMPLEMENTATION_BLUEPRINT_ARTIFACT), null)
}

export async function writeImplementationBlueprint(dir: string, blueprint: any) {
  await writeJsonAtomic(path.join(dir, IMPLEMENTATION_BLUEPRINT_ARTIFACT), blueprint)
  return blueprint
}

function normalizeStringList(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item || '').trim()).filter(Boolean))]
}

function sectionDetail(id: string, prompt: string, files: string[]): string {
  const fileList = files.slice(0, 4).join(', ')
  if (id === 'execution_plan') {
    return `1. Reproduce the cited evidence for ${prompt}.\n2. Run the cheapest decisive falsification probe named in ${fileList}.\n3. Compare observed results with the claim matrix acceptance threshold.\n4. Downgrade or withdraw any claim that does not survive.`
  }
  return `For ${prompt}, the ${id} section links source-backed claims to reproducible research artifacts such as ${fileList}, states the evidence needed to accept or reject the claim, preserves counterevidence and uncertainty, and keeps the Research route read-only while preparing an independent validation handoff.`
}

function researchArtifactName(plan: any): string {
  return String(plan?.artifacts?.research_paper || plan?.paper_artifact || 'research-paper.md')
}

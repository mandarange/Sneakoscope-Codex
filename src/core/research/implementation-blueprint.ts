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
  return {
    schema: 'sks.research-implementation-blueprint.v1',
    generated_at: nowIso(),
    prompt,
    implementation_allowed_in_research: false,
    handoff_route: '$Team',
    sections: DEFAULT_SECTION_IDS.map((id, index) => ({
      id,
      title: id.split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
      order: index + 1,
      detail: `Research handoff detail for ${id} on: ${prompt}`,
      evidence_claim_ids: [],
      target_paths: [],
      acceptance_checks: [`${id} is reviewed against cited research artifacts before implementation.`]
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
  const blockers = [
    ...(blueprint ? [] : ['implementation_blueprint_missing']),
    ...(sections.length < minSections ? ['implementation_blueprint_sections_below_contract'] : []),
    ...(completeSections.length < minSections ? ['implementation_blueprint_incomplete_sections'] : [])
  ]
  return {
    ok: blockers.length === 0,
    blockers,
    sections: sections.length,
    complete_sections: completeSections.length,
    min_sections: minSections
  }
}

export async function readImplementationBlueprint(dir: string) {
  return readJson(path.join(dir, IMPLEMENTATION_BLUEPRINT_ARTIFACT), null)
}

export async function writeImplementationBlueprint(dir: string, blueprint: any) {
  await writeJsonAtomic(path.join(dir, IMPLEMENTATION_BLUEPRINT_ARTIFACT), blueprint)
  return blueprint
}

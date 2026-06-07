export const IMPLEMENTATION_BLUEPRINT_MARKDOWN_ARTIFACT = 'implementation-blueprint.md'

export function renderImplementationBlueprintMarkdown(blueprint: any = null) {
  const lines: string[] = []
  lines.push('# Research Implementation Blueprint')
  lines.push('')
  lines.push(`Prompt: ${blueprint?.prompt || ''}`)
  lines.push(`Handoff route: ${blueprint?.handoff_route || '$Team'}`)
  lines.push(`Implementation allowed in Research: ${blueprint?.implementation_allowed_in_research === true ? 'yes' : 'no'}`)
  lines.push('')
  lines.push('## Sections')
  for (const section of Array.isArray(blueprint?.sections) ? blueprint.sections : []) {
    lines.push(`### ${section.title || section.id}`)
    lines.push('')
    lines.push(String(section.detail || ''))
    if (Array.isArray(section.acceptance_checks) && section.acceptance_checks.length) {
      lines.push('')
      lines.push('Acceptance checks:')
      for (const check of section.acceptance_checks) lines.push(`- ${check}`)
    }
    lines.push('')
  }
  if (Array.isArray(blueprint?.risks) && blueprint.risks.length) {
    lines.push('## Risks')
    for (const risk of blueprint.risks) lines.push(`- ${risk}`)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

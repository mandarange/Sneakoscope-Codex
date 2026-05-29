export const COMMAND_SUGGESTIONS_SCHEMA = 'sks.command-suggestions.v1'

export function suggestSksCommands(input: string) {
  const query = String(input || '').toLowerCase()
  const commands = ['$Team', '$Goal', '$DFix', '$QA-LOOP', '$Research', '$PPT', '$Image-UX-Review', '$Computer-Use']
  const suggestions = commands.filter((command) => command.toLowerCase().includes(query.replace(/^\$/, ''))).slice(0, 8)
  return {
    schema: COMMAND_SUGGESTIONS_SCHEMA,
    ok: true,
    query,
    suggestions
  }
}

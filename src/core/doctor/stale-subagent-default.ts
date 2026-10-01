import { catalogIsAuthoritative, latestModelForTier, supersededByNewerSameFamily } from '../subagents/model-tiers.js'

export interface StaleSubagentDefaultMove {
  text: string
  from: string | null
  to: string | null
}

const ANY_TABLE = /^\s*\[/
const AGENTS_TABLE = /^\s*\[agents\]\s*(?:#.*)?$/
const DEFAULT_LINE = /^(\s*default_subagent_model\s*=\s*")([^"]*)("\s*(?:#[^\r\n]*)?\s*)$/

/**
 * Codex reads `[agents].default_subagent_model` from the user-level config for
 * any spawn that names no model, and an older SKS wrote a model there that has
 * since been superseded. Move only a `gpt-<version>-<family>` value for which
 * Codex's catalog lists a newer row of the same family to the latest default
 * child model; any other value (an OpenRouter slug, the newest row of its own
 * family, a family with no newer row) and a missing catalog leave the text
 * untouched.
 */
export function moveStaleSubagentDefault(text: string): StaleSubagentDefaultMove {
  const unchanged = { text, from: null, to: null }
  if (!catalogIsAuthoritative()) return unchanged
  const lines = text.split('\n')
  let inAgents = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || ''
    if (ANY_TABLE.test(line)) {
      inAgents = AGENTS_TABLE.test(line)
      continue
    }
    if (!inAgents) continue
    const match = DEFAULT_LINE.exec(line)
    if (!match) continue
    const current = String(match[2] || '')
    if (!supersededByNewerSameFamily(current)) return unchanged
    const latest = latestModelForTier('deep')
    lines[index] = `${match[1]}${latest}${match[3]}`
    return { text: lines.join('\n'), from: current, to: latest }
  }
  return unchanged
}

export type CodexMultiAgentCanonicalEvent = 'start_agent' | 'interrupt_agent' | 'close_agent' | 'unknown'
export type CodexMultiAgentStage = 'start' | 'result' | 'unknown'

export function normalizeCodexMultiAgentEventName(name: string): {
  canonical: CodexMultiAgentCanonicalEvent
  stage: CodexMultiAgentStage
  source_name: string
} {
  const sourceName = String(name || '')
  const normalized = sourceName.trim().toLowerCase().replace(/[-.\s]+/g, '_')
  if (normalized === 'start_agent' || normalized === 'spawn_agent' || normalized === 'subagent_start') {
    return { canonical: 'start_agent', stage: 'start', source_name: sourceName }
  }
  if (normalized === 'interrupt_agent') {
    return { canonical: 'interrupt_agent', stage: 'result', source_name: sourceName }
  }
  if (normalized === 'close_agent' || normalized === 'subagent_stop') {
    return { canonical: 'close_agent', stage: 'result', source_name: sourceName }
  }
  return { canonical: 'unknown', stage: 'unknown', source_name: sourceName }
}

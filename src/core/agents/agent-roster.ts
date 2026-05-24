import { DEFAULT_AGENT_CONCURRENCY, DEFAULT_AGENT_COUNT, MAX_AGENT_COUNT, agentSessionId } from './agent-schema.js'
import type { AgentRosterEntry } from './agent-schema.js'
import { defaultAgentPersonas, validatePersonaUniqueness } from './agent-persona.js'
import { buildAgentEffortPolicy, decideAgentEffort } from './agent-effort-policy.js'

export function normalizeAgentCount(value: unknown, fallback = DEFAULT_AGENT_COUNT): number {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  const count = Math.floor(parsed)
  if (count > MAX_AGENT_COUNT) throw new Error('Agent count ' + count + ' exceeds max ' + MAX_AGENT_COUNT)
  return count
}

export function normalizeAgentConcurrency(value: unknown, agents: number): number {
  const parsed = Number(value ?? Math.min(agents, DEFAULT_AGENT_CONCURRENCY))
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(agents, DEFAULT_AGENT_CONCURRENCY)
  if (parsed > MAX_AGENT_COUNT) throw new Error('Agent concurrency ' + parsed + ' exceeds max ' + MAX_AGENT_COUNT)
  return Math.min(Math.floor(parsed), agents)
}

export function buildAgentRoster(opts: { agents?: unknown; concurrency?: unknown; prompt?: string; readonly?: boolean } = {}) {
  const agentCount = normalizeAgentCount(opts.agents)
  const concurrency = normalizeAgentConcurrency(opts.concurrency, agentCount)
  const personas = defaultAgentPersonas(agentCount)
  const uniqueness = validatePersonaUniqueness(personas)
  if (!uniqueness.ok) throw new Error('Invalid agent personas: ' + JSON.stringify(uniqueness))
  const roster: AgentRosterEntry[] = personas.map((persona, index) => {
    const effort = decideAgentEffort({ persona, prompt: opts.prompt || '', agentId: persona.id, readonly: opts.readonly === true || persona.read_only })
    return {
      id: persona.id,
      session_id: agentSessionId(persona.id, index + 1),
      persona_id: persona.id,
      role: persona.role,
      index: index + 1,
      write_policy: persona.write_policy,
      status: 'pending',
      reasoning_effort: effort.reasoning_effort,
      model_reasoning_effort: effort.model_reasoning_effort,
      reasoning_profile: effort.reasoning_profile,
      service_tier: effort.service_tier,
      reasoning_reason: effort.reason,
      dynamic_effort_policy: {
        escalation_triggers: effort.escalation_triggers,
        downshift_triggers: effort.downshift_triggers
      }
    }
  })
  const result = {
    schema: 'sks.agent-roster.v1',
    default_agents: DEFAULT_AGENT_COUNT,
    max_agents: MAX_AGENT_COUNT,
    agent_count: agentCount,
    concurrency,
    batch_count: Math.ceil(agentCount / concurrency),
    personas,
    persona_uniqueness: uniqueness,
    roster
  }
  return {
    ...result,
    effort_policy: buildAgentEffortPolicy(result)
  }
}

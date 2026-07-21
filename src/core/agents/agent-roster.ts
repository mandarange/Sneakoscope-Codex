import { DEFAULT_AGENT_CONCURRENCY, DEFAULT_AGENT_COUNT, HARD_AGENT_CONCURRENCY, MAX_AGENT_COUNT, agentSessionId } from './agent-schema.js'
import type { AgentRosterEntry } from './agent-schema.js'
import { defaultAgentPersonas, validatePersonaUniqueness } from './agent-persona.js'
import { buildAgentEffortPolicy, decideAgentEffort, decideOfficialSubagentModel } from './agent-effort-policy.js'

function resolveMaxAgentCount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return MAX_AGENT_COUNT
  return Math.floor(parsed)
}

export function normalizeAgentCount(value: unknown, fallback = DEFAULT_AGENT_COUNT, maxAgentCount: number = MAX_AGENT_COUNT): number {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  const count = Math.floor(parsed)
  if (count > maxAgentCount) throw new Error('Agent count ' + count + ' exceeds max ' + maxAgentCount)
  return count
}

export function normalizeAgentConcurrency(value: unknown, agents: number, maxAgentCount: number = MAX_AGENT_COUNT): number {
  // Concurrency tracks Naruto frame budget (agents / maxAgentCount / hard ceiling).
  // DEFAULT_AGENT_CONCURRENCY is a default, not a second hard creation cap of 4.
  const frameCap = Math.max(1, Math.min(agents, maxAgentCount, HARD_AGENT_CONCURRENCY))
  const fallback = Math.max(1, Math.min(frameCap, DEFAULT_AGENT_CONCURRENCY, agents))
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  if (parsed > maxAgentCount) throw new Error('Agent concurrency ' + parsed + ' exceeds max ' + maxAgentCount)
  return Math.min(Math.floor(parsed), frameCap)
}

export function buildAgentRoster(opts: {
  agents?: unknown
  concurrency?: unknown
  prompt?: string
  readonly?: boolean
  maxAgentCount?: number
  /** Official Naruto / GPT-5.6 four-profile matrix instead of legacy effort inheritance. */
  officialSubagentPolicy?: boolean
} = {}) {
  const maxAgentCount = resolveMaxAgentCount(opts.maxAgentCount)
  const agentCount = normalizeAgentCount(opts.agents, DEFAULT_AGENT_COUNT, maxAgentCount)
  const concurrency = normalizeAgentConcurrency(opts.concurrency, agentCount, maxAgentCount)
  const personas = defaultAgentPersonas(agentCount)
  const uniqueness = validatePersonaUniqueness(personas)
  if (!uniqueness.ok) throw new Error('Invalid agent personas: ' + JSON.stringify(uniqueness))
  const roster: AgentRosterEntry[] = personas.map((persona, index) => {
    const effort = opts.officialSubagentPolicy === true
      ? decideOfficialSubagentModel({ persona, prompt: opts.prompt || '', agentId: persona.id, readonly: opts.readonly === true || persona.read_only })
      : decideAgentEffort({ persona, prompt: opts.prompt || '', agentId: persona.id, readonly: opts.readonly === true || persona.read_only })
    return {
      id: persona.id,
      session_id: agentSessionId(persona.id, index + 1),
      persona_id: persona.id,
      role: persona.role,
      index: index + 1,
      write_policy: persona.write_policy,
      status: 'pending',
      model: effort.model,
      reasoning_effort: effort.reasoning_effort,
      model_reasoning_effort: effort.model_reasoning_effort,
      model_tier: effort.model_tier,
      model_profile: effort.model_profile,
      model_selection_reason: effort.model_selection_reason,
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
    max_agents: maxAgentCount,
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

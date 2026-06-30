import { AGENT_INTAKE_STAGE_ID, DEFAULT_AGENT_COUNT } from './agent-schema.js'

const AGENT_REQUIRED_ROUTE_KEYS = new Set([
  'team', '$team', 'naruto', '$naruto', 'shadowclone', '$shadowclone', 'shadow-clone', '$shadow-clone', 'kagebunshin', '$kagebunshin', 'kage-bunshin', '$kage-bunshin',
  'research', '$research', 'autoresearch', '$autoresearch', 'qa-loop', '$qa-loop', 'review', '$review', 'release-review', '$release-review'
])

function routeKey(route: any): string {
  return String(route?.id || route?.command || route?.name || route || '').trim().toLowerCase()
}

export function routeRequiresAgentIntake(route: any, input: any = {}): boolean {
  if (input.noAgents === true || input.agents === false) return false
  if (input.force === true || input.forceAgents === true) return true
  const key = routeKey(route)
  if (AGENT_REQUIRED_ROUTE_KEYS.has(key)) return true
  const task = String(input.task || '')
  return /\$(Team|Naruto|ShadowClone|Kagebunshin|Research|AutoResearch|QA-LOOP|Review|Release-Review)\b/i.test(task)
}

export function normalizeAgentPolicy(route: any, task: any = '', input: any = {}) {
  const required = routeRequiresAgentIntake(route, { task, ...(typeof input === 'object' && input ? input : {}) })
  return {
    schema: 'sks.agent-intake-policy.v1',
    required,
    stage_id: AGENT_INTAKE_STAGE_ID,
    agent_count: required ? DEFAULT_AGENT_COUNT : 0,
    backend: 'native-agent-kernel',
    outputs: ['agents/agent-proof-evidence.json', 'agents/agent-sessions.json', 'agents/agent-leases.json', 'agents/agent-consensus.json']
  }
}

export function agentPipelineStage(policy: any = {}) {
  const required = policy.required !== false
  return {
    id: AGENT_INTAKE_STAGE_ID,
    goal: 'Run native multi-session agent intake with non-overlapping leases and proof evidence.',
    agent_count: required ? Number(policy.agent_count || DEFAULT_AGENT_COUNT) : 0,
    max_parallel_native_sessions: Number(policy.agent_count || DEFAULT_AGENT_COUNT),
    backend: 'native-agent-kernel',
    read_only: false,
    write_policy: 'bounded workspace-write analysis leases; parent-owned integration',
    outputs: policy.outputs || ['agents/agent-proof-evidence.json']
  }
}

import type { AgentPersona } from './agent-schema.js'
import { codexModelEffortCapability, type CodexModelEffortCapability } from '../codex-control/codex-model-capabilities.js'

export type AgentReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

export interface AgentEffortDecision {
  schema: 'sks.agent-effort-decision.v1'
  policy_version: 1
  agent_id: string
  role: string
  reasoning_effort: AgentReasoningEffort
  model_reasoning_effort: AgentReasoningEffort
  reasoning_profile: string
  service_tier: 'fast'
  reason: string
  dynamic: true
  escalation_triggers: string[]
  downshift_triggers: string[]
  model_effort_capability?: CodexModelEffortCapability
}

const XHIGH_SIGNAL_RE = /(frontier|autoresearch|novelty|hypothesis|falsif|forensic|from-chat-img|image\s*work\s*order|새로운\s*연구|가설|포렌식)/i
const HIGH_SIGNAL_RE = /(database|supabase|sql|migration|security|permission|mad|release|publish|deploy|architecture|policy|schema|hook|rollback|db|보안|배포|마이그레이션|데이터베이스|권한|릴리즈)/i
const MEDIUM_SIGNAL_RE = /(tmux|terminal|cli|tool(?:\s|-)?call|router|routing|orchestrat|pipeline|multi[-\s]?session|multi[-\s]?agent|lease|ledger|proof|검증|파이프라인|오케스트레이션|병렬|에이전트)/i
const SIMPLE_SIGNAL_RE = /(tiny|simple|small|one[-\s]?line|typo|copy|label|spacing|rename|readme|docs?|간단|단순|오타|문구|라벨)/i

export function decideAgentEffort(input: { persona?: Partial<AgentPersona>; prompt?: string; agentId?: string; readonly?: boolean } = {}): AgentEffortDecision {
  const persona = input.persona || {}
  const prompt = String(input.prompt || '')
  const role = String(persona.role || '')
  const agentId = String(input.agentId || persona.id || 'agent')
  const text = [prompt, role, persona.risk_focus, persona.write_policy, persona.stable_id].join(' ')
  let effort = promptEffort(text)
  let reason = effortReason(effort)

  if (/(db|safety|security|release|schema)/i.test([role, agentId, persona.stable_id, persona.risk_focus].join(' '))) {
    effort = effort === 'xhigh' ? 'xhigh' : 'high'
    reason = 'risk_guardian_lane'
  } else if (/(integrator|architect|verifier)/i.test([role, agentId, persona.stable_id].join(' ')) && effort === 'low') {
    effort = 'medium'
    reason = 'planning_verification_minimum'
  } else if (input.readonly === true && SIMPLE_SIGNAL_RE.test(prompt) && !HIGH_SIGNAL_RE.test(text) && !MEDIUM_SIGNAL_RE.test(text)) {
    effort = 'low'
    reason = 'read_only_simple_slice'
  } else if (/implementer/i.test(role) && effort === 'xhigh') {
    effort = 'high'
    reason = 'implementation_lane_capped_at_high'
  }

  const modelCapability = codexModelEffortCapability({ defaultEffort: effort })
  return {
    schema: 'sks.agent-effort-decision.v1',
    policy_version: 1,
    agent_id: agentId,
    role,
    reasoning_effort: effort,
    model_reasoning_effort: effort,
    model_effort_capability: modelCapability,
    reasoning_profile: reasoningProfileName(effort),
    service_tier: 'fast',
    reason,
    dynamic: true,
    escalation_triggers: [
      'DB/security/release/schema risk detected',
      'lease conflict or proof blocker appears',
      'verification fails or output schema validation fails',
      'user requests real backend or broader agent fan-out'
    ],
    downshift_triggers: [
      'read-only simple docs/copy slice',
      'mock fixture backend with no risky file ownership',
      'agent assigned narrow inventory-only work'
    ]
  }
}

// Any action-tool signal (write/run/search/mcp/db/etc.) lifts a clone to medium.
// Passive reading alone does not count — "really simple" no-tool work stays at low.
const NARUTO_ACTION_TOOL_RE = /(write|edit|create|modif|delete|remove|run\b|exec|command|bash|shell|script|install|build|test|migrat|patch|apply|fetch|curl|http|mcp|sql|database|\bdb\b|deploy|commit|push|rename|refactor|generate|scaffold|작성|수정|생성|삭제|실행|명령|빌드|테스트|설치|배포|패치|커밋|마이그레이션)/i

// $Naruto shadow-clone effort policy: dynamic like team mode, but capped.
//   - truly simple / no tool use  -> low
//   - any tool use (one is enough) -> medium
//   - NEVER escalates to high/xhigh
//   - ALWAYS fast service tier
export function decideNarutoCloneEffort(input: { persona?: Partial<AgentPersona>; prompt?: string; agentId?: string; readonly?: boolean } = {}): AgentEffortDecision {
  const persona = input.persona || {}
  const prompt = String(input.prompt || '')
  const role = String(persona.role || '')
  const agentId = String(input.agentId || persona.id || 'naruto_clone')
  const readonly = input.readonly === true || persona.read_only === true
  const allowedTools = Array.isArray(persona.allowed_tools) ? persona.allowed_tools : []
  const writePolicy = String(persona.write_policy || '')
  // Tool use is driven by (a) write capability, (b) the persona's actual action tools, or
  // (c) the work prompt itself — NOT by incidental persona prose (role/risk_focus), so a
  // read-only analysis clone on a no-tool prompt stays at low. Passive Read/Grep ≠ tool use.
  const hasActionTool = allowedTools.some((tool) => /write|edit|create|bash|shell|command|exec|run|mcp|patch|apply|multiedit|notebook/i.test(String(tool)))
  const writes = !readonly || /write|edit|route-local|workspace|patch|integrat/i.test(writePolicy) || hasActionTool
  const toolUse = writes || NARUTO_ACTION_TOOL_RE.test(prompt)
  const effort: AgentReasoningEffort = toolUse ? 'medium' : 'low'
  const modelCapability = codexModelEffortCapability({ defaultEffort: effort })
  return {
    schema: 'sks.agent-effort-decision.v1',
    policy_version: 1,
    agent_id: agentId,
    role,
    reasoning_effort: effort,
    model_reasoning_effort: effort,
    model_effort_capability: modelCapability,
    reasoning_profile: reasoningProfileName(effort),
    service_tier: 'fast',
    reason: toolUse ? 'naruto_tool_use_medium' : 'naruto_simple_no_tool_low',
    dynamic: true,
    escalation_triggers: [
      'any tool use (write/edit/run/search/build/mcp/db) lifts the clone from low to medium'
    ],
    downshift_triggers: [
      'truly simple, no-tool, read-only reasoning stays at low'
    ]
  }
}

export function buildAgentEffortPolicy(roster: any = {}) {
  const decisions = Array.isArray(roster.roster) ? roster.roster.map((agent: any) => ({
    agent_id: agent.id,
    session_id: agent.session_id,
    role: agent.role,
    reasoning_effort: agent.reasoning_effort,
    reasoning_profile: agent.reasoning_profile,
    reason: agent.reasoning_reason,
    dynamic: true
  })) : []
  return {
    schema: 'sks.agent-effort-policy.v1',
    policy_version: 1,
    dynamic: true,
    service_tier: 'fast',
    allowed_efforts: codexModelEffortCapability().advertised_efforts,
    model_effort_capability: codexModelEffortCapability(),
    max_agents: roster.max_agents || 20,
    agent_count: roster.agent_count || decisions.length,
    concurrency: roster.concurrency || decisions.length,
    decisions,
    rule: 'Parent orchestration assigns per-agent effort from prompt risk, persona role, lease ownership, and proof state; lanes can escalate on blockers and downshift for narrow read-only work.'
  }
}

export function reasoningProfileName(effort: AgentReasoningEffort | string) {
  return 'sks-agent-' + String(effort || 'medium') + '-fast'
}

function promptEffort(text: string): AgentReasoningEffort {
  if (XHIGH_SIGNAL_RE.test(text)) return 'xhigh'
  if (HIGH_SIGNAL_RE.test(text)) return 'high'
  if (SIMPLE_SIGNAL_RE.test(text) && !MEDIUM_SIGNAL_RE.test(text)) return 'low'
  if (MEDIUM_SIGNAL_RE.test(text)) return 'medium'
  return 'medium'
}

function effortReason(effort: AgentReasoningEffort) {
  if (effort === 'xhigh') return 'frontier_or_forensic_signal'
  if (effort === 'high') return 'safety_release_db_schema_signal'
  if (effort === 'low') return 'simple_bounded_slice'
  return 'default_orchestration_slice'
}

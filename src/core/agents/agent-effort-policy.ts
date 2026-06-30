import type { AgentPersona } from './agent-schema.js'
import { codexModelEffortCapability, type CodexModelEffortCapability } from '../codex-control/codex-model-capabilities.js'
import { GPT54_MINI_CODEX_MODEL, REQUIRED_CODEX_MODEL } from '../codex-model-guard.js'
import { GLM_52_OPENROUTER_MODEL, type Glm52ReasoningEffort } from '../providers/glm/glm-52-settings.js'

export type AgentReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'
export type AgentModelReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type AgentWorkerModelTier = 'gpt-5.4-mini' | 'gpt-5.5-low' | 'gpt-5.5-high' | 'glm-5.2-minimal' | 'glm-5.2-low' | 'glm-5.2-high' | 'glm-5.2-xhigh'

export interface AgentEffortDecision {
  schema: 'sks.agent-effort-decision.v1'
  policy_version: 1
  agent_id: string
  role: string
  model: string
  reasoning_effort: AgentReasoningEffort
  model_reasoning_effort: AgentModelReasoningEffort
  model_tier: AgentWorkerModelTier
  model_profile: string
  model_selection_reason: string
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
const SIMPLE_CODE_MOD_RE = /(tiny|simple|small|one[-\s]?line|typo|copy|label|spacing|rename|readme|docs?|minor|bounded|간단|단순|작은|오타|문구|라벨|이름\s*변경)/i

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

  const modelDecision = decideAgentWorkerModel({ effort, prompt, role, agentId, readonly: input.readonly === true || persona.read_only === true, writePolicy: String(persona.write_policy || '') })
  const modelCapability = codexModelEffortCapability({ model: modelDecision.model, defaultEffort: modelDecision.model_reasoning_effort })
  return {
    schema: 'sks.agent-effort-decision.v1',
    policy_version: 1,
    agent_id: agentId,
    role,
    model: modelDecision.model,
    reasoning_effort: effort,
    model_reasoning_effort: modelDecision.model_reasoning_effort,
    model_tier: modelDecision.model_tier,
    model_profile: modelDecision.model_profile,
    model_selection_reason: modelDecision.reason,
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
  const modelDecision = decideAgentWorkerModel({ effort, prompt, role, agentId, readonly, writePolicy: String(writePolicy || '') })
  const modelCapability = codexModelEffortCapability({ model: modelDecision.model, defaultEffort: modelDecision.model_reasoning_effort })
  return {
    schema: 'sks.agent-effort-decision.v1',
    policy_version: 1,
    agent_id: agentId,
    role,
    model: modelDecision.model,
    reasoning_effort: effort,
    model_reasoning_effort: modelDecision.model_reasoning_effort,
    model_tier: modelDecision.model_tier,
    model_profile: modelDecision.model_profile,
    model_selection_reason: modelDecision.reason,
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
    model: agent.model,
    reasoning_effort: agent.reasoning_effort,
    model_reasoning_effort: agent.model_reasoning_effort,
    model_tier: agent.model_tier,
    model_profile: agent.model_profile,
    model_selection_reason: agent.model_selection_reason,
    reasoning_profile: agent.reasoning_profile,
    reason: agent.reasoning_reason,
    dynamic: true
  })) : []
  return {
    schema: 'sks.agent-effort-policy.v1',
    policy_version: 1,
    dynamic: true,
    service_tier: 'fast',
    allowed_models: [GPT54_MINI_CODEX_MODEL, REQUIRED_CODEX_MODEL, GLM_52_OPENROUTER_MODEL],
    model_tiers: ['gpt-5.4-mini', 'gpt-5.5-low', 'gpt-5.5-high', 'glm-5.2-minimal', 'glm-5.2-low', 'glm-5.2-high', 'glm-5.2-xhigh'],
    allowed_efforts: codexModelEffortCapability().advertised_efforts,
    model_effort_capability: codexModelEffortCapability(),
    max_agents: roster.max_agents || 20,
    agent_count: roster.agent_count || decisions.length,
    concurrency: roster.concurrency || decisions.length,
    decisions,
    rule: 'Parent orchestration assigns per-agent model tiers from prompt risk, persona role, lease ownership, and proof state: simple bounded GPT workers can downshift to gpt-5.4-mini; ordinary GPT workers use gpt-5.5 low; risky GPT lanes use gpt-5.5 high. In GLM mode, native workers stay on z-ai/glm-5.2 and receive GLM effort tiers.'
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

export function decideAgentWorkerModel(input: {
  effort?: AgentReasoningEffort | string | null
  prompt?: string
  role?: string
  agentId?: string
  readonly?: boolean
  writePolicy?: string
  mainModel?: string | null
} = {}): {
  model: string
  model_reasoning_effort: AgentModelReasoningEffort
  model_tier: AgentWorkerModelTier
  model_profile: string
  reason: string
} {
  const mainModel = String(input.mainModel || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || REQUIRED_CODEX_MODEL).trim()
  const glmMain = isGlmWorkerMode(mainModel)
  const gptMain = !glmMain && (!mainModel || /^gpt-/i.test(mainModel))
  const effort = String(input.effort || 'medium')
  const text = [input.prompt, input.role, input.agentId, input.writePolicy].map((item) => String(item || '')).join(' ')
  const simpleText = [input.prompt, input.role, input.agentId].map((item) => String(item || '')).join(' ')
  const risky = HIGH_SIGNAL_RE.test(text) || XHIGH_SIGNAL_RE.test(text)
  const simple = SIMPLE_CODE_MOD_RE.test(simpleText) && !HIGH_SIGNAL_RE.test(simpleText) && !XHIGH_SIGNAL_RE.test(simpleText)
  if (glmMain) {
    const glmEffort = glmWorkerEffort({ effort, risky, simple })
    return {
      model: GLM_52_OPENROUTER_MODEL,
      model_reasoning_effort: glmEffort,
      model_tier: `glm-5.2-${glmEffort === 'none' ? 'minimal' : glmEffort}` as AgentWorkerModelTier,
      model_profile: glmProfileForReasoning(glmEffort),
      reason: `glm_52_${glmEffort}_worker`
    }
  }
  if (gptMain && risky) {
    return {
      model: REQUIRED_CODEX_MODEL,
      model_reasoning_effort: 'high',
      model_tier: 'gpt-5.5-high',
      model_profile: 'sks-agent-gpt-5.5-high-fast',
      reason: 'risk_signal_worker'
    }
  }
  if (gptMain && (simple || effort === 'low')) {
    return {
      model: GPT54_MINI_CODEX_MODEL,
      model_reasoning_effort: 'low',
      model_tier: 'gpt-5.4-mini',
      model_profile: 'sks-agent-gpt-5.4-mini-fast',
      reason: simple ? 'simple_code_or_docs_slice_downshift' : 'low_effort_worker_downshift'
    }
  }
  if (gptMain && (effort === 'high' || effort === 'xhigh')) {
    return {
      model: REQUIRED_CODEX_MODEL,
      model_reasoning_effort: 'high',
      model_tier: 'gpt-5.5-high',
      model_profile: 'sks-agent-gpt-5.5-high-fast',
      reason: 'risk_or_high_effort_worker'
    }
  }
  return {
    model: gptMain ? REQUIRED_CODEX_MODEL : mainModel || REQUIRED_CODEX_MODEL,
    model_reasoning_effort: 'low',
    model_tier: 'gpt-5.5-low',
    model_profile: 'sks-agent-gpt-5.5-low-fast',
    reason: gptMain ? 'ordinary_worker_gpt55_low' : 'non_gpt_main_model_preserved'
  }
}

function isGlmWorkerMode(mainModel: string): boolean {
  const model = String(mainModel || '').trim().toLowerCase()
  return model === GLM_52_OPENROUTER_MODEL
    || model === 'glm-5.2'
    || model === 'glm5.2'
    || process.env.SKS_GLM_MODE === '1'
    || process.env.SKS_GLM_WRAPPER_ACTIVE === '1'
    || process.env.SKS_GLM_MAD_ACTIVE === '1'
}

function glmWorkerEffort(input: { effort: string; risky: boolean; simple: boolean }): Glm52ReasoningEffort {
  if (input.effort === 'xhigh') return 'xhigh'
  if (input.risky || input.effort === 'high') return 'high'
  if (input.simple || input.effort === 'low') return 'minimal'
  return 'low'
}

function glmProfileForReasoning(effort: Glm52ReasoningEffort): string {
  if (effort === 'xhigh') return 'sks-glm-52-xhigh'
  if (effort === 'high') return 'sks-glm-52-high'
  if (effort === 'medium') return 'sks-glm-52-medium'
  if (effort === 'low') return 'sks-glm-52-low'
  if (effort === 'none') return 'sks-glm-52-mad'
  return 'sks-glm-52-minimal'
}

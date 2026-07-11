import type { AgentPersona } from './agent-schema.js'
import { codexModelEffortCapability, type CodexModelEffortCapability } from '../codex-control/codex-model-capabilities.js'
import { GLM_52_OPENROUTER_MODEL, type Glm52ReasoningEffort } from '../providers/glm/glm-52-settings.js'
import { isNarutoGpt56Model, routeNarutoGpt56Model } from '../provider/model-router.js'

export type AgentReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
export type AgentModelReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
export type AgentWorkerModelTier = string

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

// $Naruto workers use the codex-lb GPT-5.6 family only. Model and effort are
// selected by the actual work kind; the removed low/medium cap must never be
// reintroduced through tool-count or read-only heuristics.
export function decideNarutoCloneEffort(input: { persona?: Partial<AgentPersona>; prompt?: string; agentId?: string; readonly?: boolean } = {}): AgentEffortDecision {
  const persona = input.persona || {}
  const prompt = String(input.prompt || '')
  const role = String(persona.role || '')
  const agentId = String(input.agentId || persona.id || 'naruto_clone')
  const taskText = [role, agentId, persona.naruto_role].join(' ')
  const riskText = [prompt, persona.risk_focus, persona.write_policy].join(' ')
  const routed = routeNarutoGpt56Model({ taskText, riskText })
  const effort = routed.reasoning as AgentReasoningEffort
  const modelCapability = codexModelEffortCapability({
    model: routed.model,
    advertisedEfforts: narutoAdvertisedEfforts(routed.model),
    defaultEffort: effort
  })
  return {
    schema: 'sks.agent-effort-decision.v1',
    policy_version: 1,
    agent_id: agentId,
    role,
    model: routed.model,
    reasoning_effort: effort,
    model_reasoning_effort: effort,
    model_tier: `${routed.model}-${effort}`,
    model_profile: `sks-naruto-${safeProfileSegment(routed.model)}-${effort}-fast`,
    model_selection_reason: narutoSelectionReason(routed.model, effort),
    model_effort_capability: modelCapability,
    reasoning_profile: reasoningProfileName(effort),
    service_tier: 'fast',
    reason: narutoSelectionReason(routed.model, effort),
    dynamic: true,
    escalation_triggers: [
      'complex or high-risk Terra work escalates from xhigh to max',
      'complex E2E, browser, Computer Use, or forensic Luna verification escalates from xhigh to max',
      'refactoring, architecture, planning, strategy, and integration select Sol at max'
    ],
    downshift_triggers: [
      'ordinary coding stays on Terra xhigh',
      'ordinary E2E, browser, Computer Use, and GUI verification stays on Luna xhigh'
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
  const narutoFamilyOnly = decisions.length > 0 && decisions.every((decision: any) => isNarutoGpt56Model(decision.model))
  return {
    schema: 'sks.agent-effort-policy.v1',
    policy_version: 1,
    dynamic: true,
    service_tier: 'fast',
    model_catalog_policy: narutoFamilyOnly ? 'naruto_gpt_5_6_family_dynamic' : 'codex_catalog_passthrough',
    model_constraint: narutoFamilyOnly ? ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'] : null,
    model_tiers: narutoFamilyOnly
      ? ['gpt-5.6-luna-xhigh', 'gpt-5.6-luna-max', 'gpt-5.6-terra-xhigh', 'gpt-5.6-terra-max', 'gpt-5.6-sol-max']
      : ['codex-selected-low', 'codex-selected-medium', 'codex-selected-high', 'codex-selected-xhigh', 'glm-5.2-minimal', 'glm-5.2-low', 'glm-5.2-high', 'glm-5.2-xhigh'],
    allowed_efforts: narutoFamilyOnly ? ['xhigh', 'max'] : codexModelEffortCapability().advertised_efforts,
    model_effort_capability: codexModelEffortCapability(),
    max_agents: roster.max_agents || 20,
    agent_count: roster.agent_count || decisions.length,
    concurrency: roster.concurrency || decisions.length,
    decisions,
    rule: narutoFamilyOnly
      ? 'Naruto workers use only GPT-5.6 Luna/Terra/Sol: Terra xhigh/max for coding, Sol max for refactoring/planning/strategy/integration, and Luna xhigh/max for E2E/browser/Computer Use/GUI verification.'
      : 'Codex/OpenAI workers inherit the current Codex-selected model, including future catalog entries; SKS changes only advertised reasoning effort. Explicit non-Codex provider modes retain their provider model.'
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

function narutoAdvertisedEfforts(model: string): string[] {
  return model === 'gpt-5.6-luna'
    ? ['low', 'medium', 'high', 'xhigh', 'max']
    : ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
}

function narutoSelectionReason(model: string, effort: AgentReasoningEffort): string {
  if (model === 'gpt-5.6-sol') return `naruto_refactor_plan_strategy_sol_${effort}`
  if (model === 'gpt-5.6-luna') return `naruto_e2e_browser_computer_use_luna_${effort}`
  return `naruto_coding_terra_${effort}`
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
  const mainModel = String(input.mainModel || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || '').trim()
  const glmMain = isGlmWorkerMode(mainModel)
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
  const modelEffort: AgentModelReasoningEffort = risky || effort === 'high' || effort === 'xhigh'
    ? 'high'
    : simple || effort === 'low'
      ? 'low'
      : 'medium'
  const modelLabel = mainModel || 'codex-selected'
  return {
    model: mainModel,
    model_reasoning_effort: modelEffort,
    model_tier: `${modelLabel}-${modelEffort}`,
    model_profile: `sks-agent-${safeProfileSegment(modelLabel)}-${modelEffort}-fast`,
    reason: mainModel ? 'explicit_model_preserved' : 'codex_catalog_model_inherited'
  }
}

function safeProfileSegment(value: string): string {
  return String(value || 'codex-selected').toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'codex-selected'
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

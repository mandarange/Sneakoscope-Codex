import { defaultModelCallBudget } from '../codex-control/model-call-concurrency.js'
import { codexModelEffortCapability, nextAdvertisedEffort, type CodexModelEffortCapability } from '../codex-control/codex-model-capabilities.js'
import type { CodexAccountUsageSnapshot } from '../usage/codex-account-usage.js'

export interface QaLoopBudgetPolicy {
  schema: 'sks.qa-loop-budget-policy.v1'
  ok: boolean
  account_usage_source: string
  token_usage_available: boolean
  near_limit: boolean
  remote_model_call_concurrency: number
  final_reviewer_gpt_backed: true
  warnings: string[]
}

export function buildQaLoopBudgetPolicy(input: { usage?: CodexAccountUsageSnapshot | null; provider?: string | null } = {}): QaLoopBudgetPolicy {
  const usage = input.usage || null
  const available = Boolean(usage?.token_usage)
  const limit = Number(usage?.usage_limit_tokens || 0)
  const total = Number(usage?.token_usage?.total_tokens || 0)
  const nearLimit = Boolean(limit > 0 && total / limit >= 0.9)
  const baseBudget = defaultModelCallBudget(String(input.provider || 'codex-sdk'))
  return {
    schema: 'sks.qa-loop-budget-policy.v1',
    ok: available,
    account_usage_source: usage?.source || 'unavailable',
    token_usage_available: available,
    near_limit: nearLimit,
    remote_model_call_concurrency: nearLimit ? Math.max(1, Math.min(2, baseBudget)) : baseBudget,
    final_reviewer_gpt_backed: true,
    warnings: available ? [] : ['codex_account_usage_unavailable_no_hard_block']
  }
}

/**
 * Baseline: raise the effort after two failed fix attempts. In Jev mode a
 * confident Jev answer replaces the count: `escalate` raises it after the
 * first failure that needs deeper reasoning, `hold` keeps it for mechanical,
 * flaky, or environmental failures.
 */
export function selectQaLoopEscalatedEffort(input: {
  failureCount?: number
  currentEffort?: string
  capability?: CodexModelEffortCapability
  jevChoice?: 'escalate' | 'hold' | null
} = {}) {
  const capability = input.capability || codexModelEffortCapability()
  const current = input.currentEffort || capability.default_effort
  const failureCount = Number(input.failureCount || 0)
  const baseline = failureCount >= 2
  const escalate = failureCount >= 1 && input.jevChoice ? input.jevChoice === 'escalate' : baseline
  const next = escalate ? nextAdvertisedEffort(current, capability) : current
  return {
    schema: 'sks.qa-loop-effort-escalation.v1',
    model: capability.model,
    advertised_efforts: capability.advertised_efforts,
    order_source: capability.order_source,
    failure_count: failureCount,
    current_effort: current,
    next_effort: next,
    escalated: escalate && next !== current,
    decided_by: failureCount >= 1 && input.jevChoice ? 'jev' : 'failure_count'
  }
}

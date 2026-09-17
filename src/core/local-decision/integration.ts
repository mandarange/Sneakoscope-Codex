import fsp from 'node:fs/promises'
import path from 'node:path'
import { createLocalDecisionProvider, type LocalDecisionClient } from './client.js'
import { readLocalDecisionConfig } from './config.js'
import { buildPlanningDecisionInput, planningEligible, shadowSampleSelected } from './input.js'
import { adviseDecision } from './mode.js'
import { localDecisionPaths } from './paths.js'
import { renderAdvisoryContext } from './policy.js'
import type { DecisionInput, DecisionPolicyResult, LocalDecisionConfig, LocalDecisionProvider } from './types.js'

export const ADVISORY_ROUTE_BUDGET_MS = 1_500
const SUBAGENT_PLAN_FILENAME = 'subagent-plan.json'

/** The preparation result fields the advice may read (never written). */
export interface LocalDecisionPreparedResult {
  delegationPrompt: string
  plan: Record<string, any>
  budget: { requestedSubagents: number }
  taskProfile: string
  workflowRunId: string
}

/** The preparation input that names the mission; mirrors OfficialSubagentPreparationInput without importing it. */
export interface LocalDecisionPreparationInput {
  root: string
  dir: string
  missionId: string
  goal: string
  route: string
}

export interface LocalDecisionRouteOptions {
  env?: NodeJS.ProcessEnv
  /** Test seam only (see `localDecisionTestOverrides`). Production never passes a provider here. */
  provider?: LocalDecisionProvider & Partial<Pick<LocalDecisionClient, 'submitShadow'>>
  config?: LocalDecisionConfig
  budgetMs?: number
}

interface TestOverrides {
  provider?: LocalDecisionProvider & Partial<Pick<LocalDecisionClient, 'submitShadow'>>
  config?: LocalDecisionConfig
  observe?: (event: { input: DecisionInput; policy: DecisionPolicyResult | null; mode: string; eligible: boolean }) => void
}

let testOverrides: TestOverrides | null = null

/**
 * In-process test seam. Active only while SKS_LOCAL_DECISION_TEST_OVERRIDES=1
 * is set by the test itself; a production hook never sets it, so no hidden
 * fallback provider can be selected from the environment.
 */
export function setLocalDecisionTestOverrides(overrides: TestOverrides | null): void {
  testOverrides = overrides
}

function activeOverrides(): TestOverrides | null {
  return process.env.SKS_LOCAL_DECISION_TEST_OVERRIDES === '1' ? testOverrides : null
}

// Planning is asked at most once per workflow run + snapshot from this process.
const SUBMITTED_SCOPES = new Map<string, number>()
const SUBMITTED_SCOPES_LIMIT = 256

function alreadySubmitted(input: DecisionInput): boolean {
  const key = `${input.scope.projectDigest}:${input.scope.workflowRunId}:${input.scope.snapshotDigest}`
  if (SUBMITTED_SCOPES.has(key)) return true
  if (SUBMITTED_SCOPES.size >= SUBMITTED_SCOPES_LIMIT) {
    const oldest = SUBMITTED_SCOPES.keys().next().value
    if (oldest !== undefined) SUBMITTED_SCOPES.delete(oldest)
  }
  SUBMITTED_SCOPES.set(key, Date.now())
  return false
}

async function scopeStillCurrent(missionDir: string, workflowRunId: string): Promise<boolean> {
  try {
    const plan = JSON.parse(await fsp.readFile(path.join(missionDir, SUBAGENT_PLAN_FILENAME), 'utf8'))
    return String(plan?.workflow_run_id || '') === String(workflowRunId)
  } catch {
    return false
  }
}

/**
 * Wraps the result of `prepareOfficialSubagentMission` *after* its lifecycle
 * lock has been released and the baseline plan has been promoted. It never
 * edits the plan, counts, model, gates, or evidence. In `off` it returns the
 * very same object. In `shadow` it submits a best-effort sample and returns the
 * same object. Only in `advisory` may it append a fixed, bounded context to the
 * delegation prompt, which is the only part of the result the parent reads as
 * prompt text (the plan artifact keeps the original delegation prompt).
 */
export async function withLocalDecisionAdvice<T extends LocalDecisionPreparedResult>(
  prepared: T,
  preparation: LocalDecisionPreparationInput,
  options: LocalDecisionRouteOptions = {}
): Promise<T> {
  const overrides = activeOverrides()
  const config = options.config ?? overrides?.config ?? await readLocalDecisionConfig(options.env || process.env)
  if (config.mode === 'off') return prepared
  const eligible = planningEligible(String(prepared.taskProfile || ''))
  let input: DecisionInput
  try {
    input = buildPlanningDecisionInput({
      root: preparation.root,
      missionId: preparation.missionId,
      workflowRunId: prepared.workflowRunId,
      goal: preparation.goal,
      plan: prepared.plan,
      taskProfile: prepared.taskProfile,
      budget: prepared.budget
    })
  } catch {
    return prepared
  }
  if (!eligible) {
    overrides?.observe?.({ input, policy: null, mode: config.mode, eligible: false })
    return prepared
  }
  if (alreadySubmitted(input)) return prepared
  const provider = options.provider ?? overrides?.provider ?? defaultProvider(options.env || process.env)
  if (config.mode === 'shadow') {
    if (shadowSampleSelected(input.scope, config.shadowSampleRate) && typeof provider.submitShadow === 'function') provider.submitShadow(input)
    overrides?.observe?.({ input, policy: null, mode: 'shadow', eligible: true })
    return prepared
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.budgetMs ?? ADVISORY_ROUTE_BUDGET_MS)
  let policy: DecisionPolicyResult
  try {
    policy = await Promise.race([
      adviseDecision(input, 'advisory', provider, controller.signal),
      new Promise<DecisionPolicyResult>((resolve) => controller.signal.addEventListener('abort', () => resolve({ action: 'keep_baseline', reason: 'timeout', advice: {} }), { once: true }))
    ])
  } finally {
    clearTimeout(timer)
  }
  overrides?.observe?.({ input, policy, mode: 'advisory', eligible: true })
  if (policy.action !== 'offer_advisory') return prepared
  if (!(await scopeStillCurrent(preparation.dir, prepared.workflowRunId))) return prepared
  const context = renderAdvisoryContext(policy, 'planning')
  if (!context) return prepared
  return { ...prepared, delegationPrompt: `${prepared.delegationPrompt || ''}\n\n${context}`.trim() }
}

function defaultProvider(env: NodeJS.ProcessEnv): LocalDecisionClient {
  const paths = localDecisionPaths(env)
  // Never starts, installs, or downloads anything: a missing socket is `service_not_ready`.
  return createLocalDecisionProvider({
    socketPath: paths.socketPath,
    metadataPath: paths.serviceMetadataPath,
    connectionTimeoutMs: 50,
    requestTimeoutMs: ADVISORY_ROUTE_BUDGET_MS
  })
}

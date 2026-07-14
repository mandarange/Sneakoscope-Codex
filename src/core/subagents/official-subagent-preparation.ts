import fsp from 'node:fs/promises'
import path from 'node:path'
import { nowIso, randomId, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { classifyTaskProfile } from '../runtime/task-profile.js'
import { chooseVerificationBudget } from '../runtime/verification-budget.js'
import { buildOfficialSubagentPrompt } from './official-subagent-prompt.js'
import { readOfficialSubagentConfig } from './official-subagent-config.js'
import {
  NARUTO_PARENT_EFFORT,
  NARUTO_PARENT_MODEL
} from './model-policy.js'
import {
  MAX_ON_DEMAND_SUBAGENT_ROLE_COUNT,
  officialSubagentFanoutPolicy,
  officialSubagentOnDemandRolePlan,
  officialSubagentRoleCatalog,
  recommendOfficialSubagentRoles
} from './agent-catalog.js'
import { resolveSubagentThreadBudget } from './thread-budget.js'
import { readBoundedTriwikiAttention } from './triwiki-attention.js'
import {
  SUBAGENT_EVIDENCE_FILENAME,
  SUBAGENT_EVENT_LOG_FILENAME,
  SUBAGENT_PARENT_SUMMARY_FILENAME,
  normalizeSubagentParentSummary,
  writeSubagentEvidence
} from './subagent-evidence.js'

export const NARUTO_RESULT_SCHEMA = 'sks.naruto-subagent-workflow.v1'
export const SUBAGENT_PLAN_FILENAME = 'subagent-plan.json'
export const NARUTO_SUMMARY_FILENAME = 'naruto-summary.json'
export const NARUTO_GATE_FILENAME = 'naruto-gate.json'

export interface OfficialSubagentPreparationInput {
  root: string
  dir: string
  missionId: string
  goal: string
  route: string
  sessionScope?: string | null
  requestedSubagents?: number
  requestedSubagentsExplicit?: boolean
  maxThreads?: number
  workflowRunId?: string
  mode?: 'generic' | 'naruto'
  readOnly?: boolean
  observedParentModel?: string | null
  preparationOnly?: boolean
}

export async function prepareOfficialSubagentMission(input: OfficialSubagentPreparationInput) {
  const goal = String(input.goal || '').trim()
  const mode = input.mode === 'naruto' ? 'naruto' : 'generic'
  const taskProfile = classifyTaskProfile(goal)
  const suggestedAgents = recommendOfficialSubagentRoles({
    description: goal,
    readOnly: input.readOnly === true,
    requiresWrite: input.readOnly !== true
  })
  const officialConfig = await readOfficialSubagentConfig(input.root)
  const triwikiAttention = await readBoundedTriwikiAttention(
    input.root,
    triwikiAttentionLimit(taskProfile),
    goal
  )
  const operatorRequested = input.requestedSubagentsExplicit ?? input.requestedSubagents !== undefined
  const routeContract = mode === 'generic' && !operatorRequested
    ? routeOwnedSubagentContract(input.route)
    : null
  const requestedSubagents = input.requestedSubagents ?? routeContract?.count
  const requestedSource = operatorRequested
    ? 'operator'
    : routeContract
      ? 'route_contract'
      : 'automatic'
  const selectedFanoutPolicy = officialSubagentFanoutPolicy({
    ...(requestedSubagents === undefined ? {} : { requestedSubagents }),
    requestedExplicit: requestedSource !== 'automatic',
    requestedSource,
    taskProfile,
    suggestedRoles: suggestedAgents,
    goal
  })
  const budget = resolveSubagentThreadBudget({
    requested: selectedFanoutPolicy.requested_subagents,
    configuredMaxThreads: input.maxThreads ?? officialConfig.maxThreads
  })
  const verification = chooseVerificationBudget({ taskProfile, changedFiles: [] })
  const workflowRunId = String(input.workflowRunId || '').trim()
    || `${mode === 'naruto' ? 'naruto' : 'official'}-${Date.now().toString(36)}-${randomId(8)}`
  const fanoutPolicy = {
    ...selectedFanoutPolicy,
    requested_subagents: budget.requestedSubagents
  }
  const observedParentModel = String(input.observedParentModel || '').trim() || null
  const parentModelMatch = observedParentModel ? observedParentModelMatchesPolicy(observedParentModel) : null
  const delegationGoal = input.readOnly
    ? `${goal}\n\nConstraint: run every delegated slice in read-only mode. Do not edit files.`
    : goal
  const delegationPrompt = buildOfficialSubagentPrompt({
    goal: delegationGoal,
    slices: [],
    requestedSubagents: budget.requestedSubagents,
    requestedSubagentsExplicit: requestedSource === 'operator',
    requestedSubagentsSource: requestedSource,
    maxThreads: budget.maxThreads,
    decompositionStatus: 'parent_required',
    triwikiAttention,
    recommendedAgents: suggestedAgents
  })
  const selectedAgentPlan = officialSubagentOnDemandRolePlan(suggestedAgents)
  const agentCatalog = onDemandAgentCatalogMetadata(selectedAgentPlan)
  const configBlockers = officialConfig.blockers.map((blocker) => `official_subagent_config:${blocker}`)
  const plan = {
    schema: 'sks.subagent-plan.v1',
    mission_id: input.missionId,
    route: input.route,
    workflow: 'official_codex_subagent',
    workflow_run_id: workflowRunId,
    session_scope: input.sessionScope || null,
    goal,
    read_only: input.readOnly === true,
    task_profile: taskProfile,
    decomposition_status: 'parent_required',
    delegation_prompt: delegationPrompt,
    requested_subagents: budget.requestedSubagents,
    requested_subagents_explicit: requestedSource === 'operator',
    requested_subagents_source: requestedSource,
    route_owned_count_contract: routeContract,
    max_threads: budget.maxThreads,
    first_wave: budget.firstWave,
    wave_count: budget.waveCount,
    max_depth: budget.maxDepth,
    config_source: input.maxThreads === undefined ? officialConfig.sources.maxThreads : 'cli',
    config_sources: officialConfig.sources,
    config_blockers: officialConfig.blockers,
    triwiki_attention: triwikiAttention,
    suggested_agents: suggestedAgents,
    fanout_policy: fanoutPolicy,
    slices: [],
    parent_model_policy: NARUTO_PARENT_MODEL,
    observed_parent_model: observedParentModel,
    parent_model_match: parentModelMatch,
    parent: {
      model: NARUTO_PARENT_MODEL,
      model_reasoning_effort: NARUTO_PARENT_EFFORT
    },
    agent_catalog: agentCatalog,
    agents: selectedAgentPlan,
    verification_budget: verification,
    verification_checks: [],
    verification: { budget: verification },
    legacy_process_swarm_used: false,
    created_at: nowIso()
  }

  const cleanup = [
    fsp.rm(path.join(input.dir, SUBAGENT_PARENT_SUMMARY_FILENAME), { force: true }),
    fsp.rm(path.join(input.dir, SUBAGENT_EVIDENCE_FILENAME), { force: true })
  ]
  if (mode === 'naruto') {
    cleanup.push(
      fsp.rm(path.join(input.dir, NARUTO_SUMMARY_FILENAME), { force: true }),
      fsp.rm(path.join(input.dir, NARUTO_GATE_FILENAME), { force: true })
    )
  }
  await Promise.all(cleanup)
  await writeTextAtomic(path.join(input.dir, SUBAGENT_EVENT_LOG_FILENAME), '')
  await writeJsonAtomic(path.join(input.dir, SUBAGENT_PLAN_FILENAME), plan)
  const evidence = await writeSubagentEvidence(input.dir, {
    requestedSubagents: budget.requestedSubagents,
    events: [],
    parentSummaryPresent: false,
    workflowStatus: 'delegation_context_ready',
    preparationOnly: input.preparationOnly !== false,
    runId: workflowRunId,
    additionalBlockers: configBlockers
  })

  if (mode === 'naruto') {
    const blockers = uniqueStrings([
      ...evidence.blockers,
      ...configBlockers,
      ...(parentModelMatch === false ? [`parent_model_mismatch:${observedParentModel}`] : [])
    ])
    await writeJsonAtomic(path.join(input.dir, NARUTO_SUMMARY_FILENAME), buildNarutoSummary({
      missionId: input.missionId,
      workflowRunId,
      budget,
      evidence,
      verification,
      status: 'delegation_context_ready',
      ok: false,
      blockers,
      sessionKey: input.sessionScope || null,
      suggestedAgents,
      observedParentModel,
      parentModelMatch
    }))
    await writeNarutoGate(input.dir, {
      missionId: input.missionId,
      workflowRunId,
      evidence,
      passed: false,
      blockers,
      configBlockers,
      observedParentModel,
      parentModelMatch
    })
  }

  return {
    plan,
    evidence,
    budget,
    verification,
    taskProfile,
    delegationPrompt,
    workflowRunId,
    officialConfig,
    triwikiAttention,
    suggestedAgents,
    fanoutPolicy,
    configBlockers,
    observedParentModel,
    parentModelMatch
  }
}

function triwikiAttentionLimit(taskProfile: string): number {
  return ['parallel-read', 'parallel-write', 'high-risk'].includes(taskProfile) ? 6 : 4
}

function routeOwnedSubagentContract(route: string): { count: number; reason: string } | null {
  const normalized = String(route || '').replace(/^\$/, '').trim().toLowerCase()
  if (normalized === 'research') {
    return { count: 3, reason: 'research_exact_three_independent_reviewers' }
  }
  if (normalized === 'autoresearch') {
    return { count: 3, reason: 'autoresearch_exact_three_independent_reviewers' }
  }
  return null
}

export function buildNarutoSummary(input: any) {
  const parentSummary = normalizeSubagentParentSummary(input.parentSummary)
  const suggestedAgents = Array.isArray(input.suggestedAgents)
    ? uniqueStrings(input.suggestedAgents)
    : []
  const selectedAgentPlan = officialSubagentOnDemandRolePlan(suggestedAgents)
  return {
    schema: NARUTO_RESULT_SCHEMA,
    ok: input.ok === true,
    completion_evidence: input.ok === true,
    status: input.status,
    route: '$Naruto',
    workflow: 'official_codex_subagent',
    workflow_run_id: input.workflowRunId || input.evidence?.run_id || null,
    mission_id: input.missionId,
    parent: {
      model: NARUTO_PARENT_MODEL,
      model_reasoning_effort: NARUTO_PARENT_EFFORT,
      observed_model: input.observedParentModel || null,
      observed_model_match: input.parentModelMatch ?? null
    },
    requested_subagents: input.budget.requestedSubagents,
    max_threads: input.budget.maxThreads,
    max_depth: input.budget.maxDepth,
    started_subagents: Number(input.evidence?.started_threads || 0),
    completed_subagents: Number(input.evidence?.completed_threads || 0),
    failed_subagents: Number(input.evidence?.failed_threads || 0),
    agent_catalog: onDemandAgentCatalogMetadata(selectedAgentPlan),
    agents: selectedAgentPlan,
    verification: {
      budget: input.verification,
      checks: []
    },
    parent_summary_present: Boolean(input.parentSummary),
    parent_summary: parentSummary.summary,
    parent_thread_outcomes: parentSummary.raw?.thread_outcomes || [],
    app_session: input.appSession === true,
    session_scope: input.sessionKey || null,
    blockers: uniqueStrings(input.blockers || input.evidence?.blockers || []),
    legacy_process_swarm_used: false,
    updated_at: nowIso()
  }
}

function onDemandAgentCatalogMetadata(
  selectedAgentPlan: Record<string, unknown>
) {
  const selectedAgents = Object.keys(selectedAgentPlan)
  return {
    mode: 'on_demand',
    total_available: officialSubagentRoleCatalog().length,
    selected_count: selectedAgents.length,
    selected_agents: selectedAgents,
    max_injected: MAX_ON_DEMAND_SUBAGENT_ROLE_COUNT,
    full_catalog_injected: false
  }
}

export async function writeNarutoGate(dir: string, input: any) {
  await writeJsonAtomic(path.join(dir, NARUTO_GATE_FILENAME), buildNarutoGateResult(input))
}

export function buildNarutoGateResult(input: any) {
  const passed = input.passed === true
  const requested = Number(input.evidence?.requested_subagents || 0)
  const completed = Number(input.evidence?.completed_threads || 0)
  const failed = Number(input.evidence?.failed_threads || 0)
  return {
    schema: 'sks.naruto-gate.v1',
    route: '$Naruto',
    workflow: 'official_codex_subagent',
    workflow_run_id: input.workflowRunId || input.evidence?.run_id || null,
    mission_id: input.missionId,
    parent_model_policy: NARUTO_PARENT_MODEL,
    observed_parent_model: input.observedParentModel || null,
    parent_model_match: input.parentModelMatch ?? null,
    status: passed ? 'passed' : 'blocked',
    passed,
    terminal: passed,
    terminal_state: passed ? 'completed' : 'blocked',
    subagent_plan_ready: true,
    official_subagent_evidence: input.evidence?.ok === true,
    session_cleanup: failed === 0 && requested > 0 && completed >= requested,
    subagent_evidence_ready: input.evidence?.ok === true,
    requested_subagents: requested || null,
    started_subagents: Number(input.evidence?.started_threads || 0),
    completed_subagents: Number(input.evidence?.completed_threads || 0),
    failed_subagents: Number(input.evidence?.failed_threads || 0),
    parent_summary_present: input.evidence?.parent_summary_present === true,
    event_sources: input.evidence?.event_sources || [],
    native_process_proof_required: false,
    legacy_process_swarm_used: false,
    config_blockers: uniqueStrings(input.configBlockers || []),
    blockers: uniqueStrings(input.blockers || input.evidence?.blockers || []),
    missing_fields: uniqueStrings(input.blockers || input.evidence?.blockers || []),
    updated_at: nowIso()
  }
}

function observedParentModelMatchesPolicy(model: string) {
  return model.toLowerCase() === NARUTO_PARENT_MODEL || /gpt[-_. ]?5\.6[-_. ]?sol|\bsol(?:\s+max)?\b/i.test(model)
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

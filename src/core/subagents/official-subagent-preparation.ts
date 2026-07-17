import fsp from 'node:fs/promises'
import path from 'node:path'
import { nowIso, randomId, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { SSOT_GUARD_ARTIFACT, buildSsotGuard, validateSsotGuardArtifact } from '../safety/ssot-guard.js'
import { classifyTaskProfile } from '../runtime/task-profile.js'
import { chooseVerificationBudget } from '../runtime/verification-budget.js'
import {
  buildOfficialSubagentPrompt,
  validateOfficialSubagentSlices,
  type OfficialSubagentSlice
} from './official-subagent-prompt.js'
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
import {
  resolveSubagentThreadBudget,
  type SubagentThreadBudgetInput
} from './thread-budget.js'
import { readBoundedTriwikiAttention } from './triwiki-attention.js'
import {
  SUBAGENT_EVIDENCE_FILENAME,
  SUBAGENT_EVENT_LOG_FILENAME,
  SUBAGENT_PARENT_SUMMARY_FILENAME,
  normalizeSubagentParentSummary,
  writeSubagentEvidence
} from './subagent-evidence.js'
import { sksPrefixedDollarCommand, unprefixedSksSkillName } from '../routes/dollar-prefix.js'
import {
  tryWithFileLock,
  type FileLockLease
} from '../locks/file-lock.js'

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
  slices?: OfficialSubagentSlice[]
  capacity?: Omit<
    SubagentThreadBudgetInput,
    'requested' | 'configuredMaxThreads' | 'independentSliceCount'
  >
}

export async function prepareOfficialSubagentMission(input: OfficialSubagentPreparationInput) {
  const goal = String(input.goal || '').trim()
  const mode = input.mode === 'naruto' ? 'naruto' : 'generic'
  const taskProfile = classifyTaskProfile(goal)
  const slices = Array.isArray(input.slices) ? input.slices : []
  const decompositionStatus = slices.length > 0 ? 'ready' : 'parent_required'
  const sliceSafety = validateOfficialSubagentSlices(slices)
  const suggestedAgents = uniqueStrings([
    ...recommendOfficialSubagentRoles({
      description: goal,
      readOnly: input.readOnly === true,
      requiresWrite: input.readOnly !== true
    }),
    ...slices.map((slice) => slice.agent || '').filter(Boolean)
  ])
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
    goal,
    ...(slices.length > 0 ? { independentSliceCount: slices.length } : {})
  })
  const budget = resolveSubagentThreadBudget({
    requested: selectedFanoutPolicy.requested_subagents,
    configuredMaxThreads: input.maxThreads ?? officialConfig.maxThreads,
    ...(input.capacity || {}),
    ...(slices.length > 0
      ? {
          independentSliceCount: slices.length,
          readyDagWidth: input.capacity?.readyDagWidth ?? slices.length,
          disjointOwnershipCount: input.capacity?.disjointOwnershipCount ?? (sliceSafety.safe ? slices.length : 0)
        }
      : {})
  })
  const verification = chooseVerificationBudget({ taskProfile, changedFiles: [] })
  const workflowRunId = String(input.workflowRunId || '').trim()
    || `${mode === 'naruto' ? 'naruto' : 'official'}-${Date.now().toString(36)}-${randomId(8)}`
  const fanoutPolicy = {
    ...selectedFanoutPolicy,
    requested_subagents: budget.requestedSubagents,
    capacity_controller: budget.capacity
  }
  const observedParentModel = String(input.observedParentModel || '').trim() || null
  const parentModelMatch = observedParentModel ? observedParentModelMatchesPolicy(observedParentModel) : null
  const delegationGoal = input.readOnly
    ? `${goal}\n\nConstraint: run every delegated slice in read-only mode. Do not edit files.`
    : goal
  const delegationPrompt = buildOfficialSubagentPrompt({
    goal: delegationGoal,
    slices,
    requestedSubagents: budget.requestedSubagents,
    requestedSubagentsExplicit: requestedSource === 'operator',
    requestedSubagentsSource: requestedSource,
    maxThreads: budget.maxThreads,
    decompositionStatus,
    firstWave: budget.firstWave,
    waveCount: budget.waveCount,
    capacity: budget.capacity,
    triwikiAttention,
    recommendedAgents: suggestedAgents
  })
  const selectedAgentPlan = officialSubagentOnDemandRolePlan(suggestedAgents)
  const agentCatalog = onDemandAgentCatalogMetadata(selectedAgentPlan)
  const ssotGuard = buildSsotGuard({ route: input.route, mode: mode === 'naruto' ? 'NARUTO' : 'OFFICIAL_SUBAGENT', task: goal })
  const ssotGuardValidation = validateSsotGuardArtifact(ssotGuard)
  const configBlockers = [
    ...officialConfig.blockers,
    ...ssotGuardValidation.issues.map((issue) => `ssot_guard:${issue}`),
    ...sliceSafety.blockers.map((blocker) => `subagent_slice:${blocker}`),
    ...(budget.capacity.exhausted ? ['subagent_capacity_exhausted'] : [])
  ]
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
    decomposition_status: decompositionStatus,
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
    config_blockers: configBlockers,
    triwiki_attention: triwikiAttention,
    suggested_agents: suggestedAgents,
    fanout_policy: fanoutPolicy,
    capacity_controller: budget.capacity,
    slice_safety: sliceSafety,
    slices,
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
  await writeJsonAtomic(path.join(input.dir, SSOT_GUARD_ARTIFACT), ssotGuard)
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
  const normalized = unprefixedSksSkillName(route)
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
    route: sksPrefixedDollarCommand('naruto'),
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
    first_wave: input.budget.firstWave,
    wave_count: input.budget.waveCount,
    capacity_controller: input.budget.capacity,
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
  const ssotGuard = await readJson(path.join(dir, SSOT_GUARD_ARTIFACT), null)
  const ssotValidation = validateSsotGuardArtifact(ssotGuard)
  const blockers = uniqueStrings([
    ...(input.blockers || []),
    ...ssotValidation.issues.map((issue) => `${SSOT_GUARD_ARTIFACT}:${issue}`)
  ])
  const gate = buildNarutoGateResult({
    ...input,
    passed: input.passed === true && ssotValidation.ok && blockers.length === 0,
    ssotGuard: ssotValidation.ok,
    blockers
  })
  await writeJsonAtomic(path.join(dir, NARUTO_GATE_FILENAME), gate)
  return gate
}

export function buildNarutoGateResult(input: any) {
  const passed = input.passed === true
  const requested = Number(input.evidence?.requested_subagents || 0)
  const completed = Number(input.evidence?.completed_threads || 0)
  const failed = Number(input.evidence?.failed_threads || 0)
  return {
    schema: 'sks.naruto-gate.v1',
    route: sksPrefixedDollarCommand('naruto'),
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
    ssot_guard: input.ssotGuard === true,
    event_sources: input.evidence?.event_sources || [],
    evidence: {
      official_subagent_evidence: SUBAGENT_EVIDENCE_FILENAME,
      parent_summary: SUBAGENT_PARENT_SUMMARY_FILENAME,
      ssot_guard: SSOT_GUARD_ARTIFACT,
      requested_subagents: requested,
      started_threads: Number(input.evidence?.started_threads || 0),
      completed_threads: completed,
      failed_threads: failed
    },
    native_process_proof_required: false,
    config_blockers: uniqueStrings(input.configBlockers || []),
    blockers: uniqueStrings(input.blockers || input.evidence?.blockers || []),
    missing_fields: uniqueStrings(input.blockers || input.evidence?.blockers || []),
    updated_at: nowIso()
  }
}

function observedParentModelMatchesPolicy(model: string) {
  return model.toLowerCase() === NARUTO_PARENT_MODEL || /gpt[-_. ]?5\.6[-_. ]?sol|\bsol(?:\s+max)?\b/i.test(model)
}

export const NARUTO_MISSION_RUN_LOCK = '.naruto-run.lock'
export const NARUTO_MISSION_RUN_STALE_MS = 120_000

export interface NarutoMissionRunAdmissionInput {
  missionId: string
  missionDir: string
  prompt?: string
  staleMs?: number
}

export interface NarutoMissionRunLease {
  recovered: boolean
  protectChildPid(pid: number): Promise<void>
}

export type NarutoMissionRunAdmission<T> =
  | { kind: 'executed'; recovered: boolean; value: T }
  | { kind: 'reused'; response: Record<string, unknown> }
  | { kind: 'running'; response: Record<string, unknown> }
  | { kind: 'blocked'; response: Record<string, unknown> }

interface NarutoJsonArtifact {
  exists: boolean
  malformed: boolean
  value: Record<string, unknown> | null
}

interface NarutoAdmissionSnapshot {
  mission: NarutoJsonArtifact
  plan: NarutoJsonArtifact
  evidence: NarutoJsonArtifact
  parentSummary: NarutoJsonArtifact
  summary: NarutoJsonArtifact
  gate: NarutoJsonArtifact
  eventsExists: boolean
  eventRunIds: string[]
}

export async function withNarutoMissionRunAdmission<T>(
  input: NarutoMissionRunAdmissionInput,
  execute: (lease: NarutoMissionRunLease) => Promise<T>
): Promise<NarutoMissionRunAdmission<T>> {
  const normalized = normalizeNarutoAdmissionInput(input)
  const initial = await readNarutoAdmissionSnapshot(normalized.missionDir)
  const reusable = reusableNarutoTerminalResponse(normalized.missionId, initial)
  if (reusable) return { kind: 'reused', response: reusable }

  const lock = await tryWithFileLock({
    lockPath: path.join(normalized.missionDir, NARUTO_MISSION_RUN_LOCK),
    staleMs: normalized.staleMs
  }, async (fileLease) => {
    const ownedSnapshot = await readNarutoAdmissionSnapshot(normalized.missionDir)
    const ownedReusable = reusableNarutoTerminalResponse(normalized.missionId, ownedSnapshot)
    if (ownedReusable) {
      return { kind: 'reused', response: ownedReusable } satisfies NarutoMissionRunAdmission<T>
    }

    const blockers = uniqueStrings([
      ...narutoArtifactIdentityBlockers(normalized.missionId, ownedSnapshot),
      ...narutoRequestIdentityBlockers(normalized.prompt, ownedSnapshot)
    ])
    if (blockers.length > 0) {
      return {
        kind: 'blocked',
        response: blockedNarutoIdentityResponse(normalized.missionId, ownedSnapshot, blockers)
      } satisfies NarutoMissionRunAdmission<T>
    }

    const value = await execute(narutoAdmissionLease(fileLease))
    return {
      kind: 'executed',
      recovered: fileLease.recovered,
      value
    } satisfies NarutoMissionRunAdmission<T>
  })

  if (lock.acquired) return lock.value

  const afterBusy = await readNarutoAdmissionSnapshot(normalized.missionDir)
  const completedWhileWaiting = reusableNarutoTerminalResponse(normalized.missionId, afterBusy)
  if (completedWhileWaiting) return { kind: 'reused', response: completedWhileWaiting }
  return {
    kind: 'running',
    response: runningNarutoResponse(normalized.missionId, afterBusy)
  }
}

function narutoAdmissionLease(fileLease: FileLockLease): NarutoMissionRunLease {
  return {
    recovered: fileLease.recovered,
    protectChildPid: (pid: number) => fileLease.protectPid(pid)
  }
}

function normalizeNarutoAdmissionInput(
  input: NarutoMissionRunAdmissionInput
): Required<NarutoMissionRunAdmissionInput> {
  const missionId = String(input.missionId || '').trim()
  if (!missionId) throw new Error('naruto_mission_run_admission_mission_id_missing')
  return {
    missionId,
    missionDir: path.resolve(input.missionDir),
    prompt: String(input.prompt || '').trim(),
    staleMs: Math.max(1, input.staleMs ?? NARUTO_MISSION_RUN_STALE_MS)
  }
}

async function readNarutoAdmissionSnapshot(missionDir: string): Promise<NarutoAdmissionSnapshot> {
  const [mission, plan, evidence, parentSummary, summary, gate, events] = await Promise.all([
    readNarutoJsonArtifact(path.join(missionDir, 'mission.json')),
    readNarutoJsonArtifact(path.join(missionDir, SUBAGENT_PLAN_FILENAME)),
    readNarutoJsonArtifact(path.join(missionDir, SUBAGENT_EVIDENCE_FILENAME)),
    readNarutoJsonArtifact(path.join(missionDir, SUBAGENT_PARENT_SUMMARY_FILENAME)),
    readNarutoJsonArtifact(path.join(missionDir, NARUTO_SUMMARY_FILENAME)),
    readNarutoJsonArtifact(path.join(missionDir, NARUTO_GATE_FILENAME)),
    fsp.readFile(path.join(missionDir, SUBAGENT_EVENT_LOG_FILENAME), 'utf8')
      .then((text) => ({ exists: true, runIds: narutoEventRunIds(text) }))
      .catch(() => ({ exists: false, runIds: [] as string[] }))
  ])
  return {
    mission,
    plan,
    evidence,
    parentSummary,
    summary,
    gate,
    eventsExists: events.exists,
    eventRunIds: events.runIds
  }
}

async function readNarutoJsonArtifact(file: string): Promise<NarutoJsonArtifact> {
  try {
    const parsed: unknown = JSON.parse(await fsp.readFile(file, 'utf8'))
    if (!isNarutoRecord(parsed)) return { exists: true, malformed: true, value: null }
    return { exists: true, malformed: false, value: parsed }
  } catch (error: unknown) {
    if (narutoErrorCode(error) === 'ENOENT') return { exists: false, malformed: false, value: null }
    return { exists: true, malformed: true, value: null }
  }
}

function reusableNarutoTerminalResponse(
  missionId: string,
  snapshot: NarutoAdmissionSnapshot
): Record<string, unknown> | null {
  if (narutoArtifactIdentityBlockers(missionId, snapshot).length > 0) return null
  const plan = snapshot.plan.value
  const evidence = snapshot.evidence.value
  const summary = snapshot.summary.value
  const gate = snapshot.gate.value
  const runId = canonicalNarutoRunId(snapshot)
  if (!runId) return null
  const core = Boolean(
    plan?.schema === 'sks.subagent-plan.v1'
      && plan?.workflow === 'official_codex_subagent'
      && evidence?.schema === 'sks.subagent-evidence.v1'
      && evidence?.workflow === 'official_codex_subagent'
      && summary?.schema === NARUTO_RESULT_SCHEMA
      && summary?.workflow === 'official_codex_subagent'
      && gate?.schema === 'sks.naruto-gate.v1'
      && gate?.workflow === 'official_codex_subagent'
  )
  if (!core || !summary || !gate || !evidence) return null

  const completed = summary.status === 'completed'
    && summary.ok === true
    && summary.completion_evidence === true
    && evidence.status === 'completed'
    && evidence.ok === true
    && evidence.parent_summary_trustworthy === true
    && gate.passed === true
    && gate.terminal === true
    && gate.terminal_state === 'completed'
    && snapshot.parentSummary.exists
    && !snapshot.parentSummary.malformed
    && snapshot.eventsExists
  if (completed) {
    return reusedNarutoResponse(missionId, runId, 'completed', summary, gate, evidence, true)
  }

  const blocked = summary.status === 'blocked'
    && summary.ok !== true
    && gate.passed !== true
    && gate.terminal_state === 'blocked'
    && (
      evidence.status === 'blocked'
      || uniqueStrings([
        ...narutoArray(evidence.blockers),
        ...narutoArray(gate.blockers)
      ]).length > 0
    )
  if (blocked) {
    return reusedNarutoResponse(
      missionId,
      runId,
      'blocked',
      summary,
      gate,
      evidence,
      snapshot.parentSummary.exists && !snapshot.parentSummary.malformed
    )
  }
  return null
}

function reusedNarutoResponse(
  missionId: string,
  runId: string,
  status: 'completed' | 'blocked',
  summary: Record<string, unknown>,
  gate: Record<string, unknown>,
  evidence: Record<string, unknown>,
  parentSummaryPresent: boolean
): Record<string, unknown> {
  return {
    ...summary,
    schema: NARUTO_RESULT_SCHEMA,
    ok: status === 'completed',
    completion_evidence: status === 'completed',
    status,
    mission_id: missionId,
    workflow_run_id: runId,
    parent_summary_present: parentSummaryPresent,
    reused: true,
    already_running: false,
    blockers: uniqueStrings([
      ...narutoArray(summary.blockers),
      ...narutoArray(gate.blockers),
      ...narutoArray(evidence.blockers)
    ])
  }
}

function runningNarutoResponse(
  missionId: string,
  snapshot: NarutoAdmissionSnapshot
): Record<string, unknown> {
  return {
    schema: NARUTO_RESULT_SCHEMA,
    ok: false,
    completion_evidence: false,
    status: 'running',
    mission_id: missionId,
    workflow: 'official_codex_subagent',
    workflow_run_id: activeNarutoRunId(snapshot),
    reused: false,
    already_running: true,
    blockers: []
  }
}

function activeNarutoRunId(snapshot: NarutoAdmissionSnapshot): string | null {
  return narutoText(snapshot.plan.value?.workflow_run_id)
    || narutoText(snapshot.summary.value?.workflow_run_id)
    || narutoText(snapshot.gate.value?.workflow_run_id)
    || narutoText(snapshot.evidence.value?.run_id)
    || null
}

function blockedNarutoIdentityResponse(
  missionId: string,
  snapshot: NarutoAdmissionSnapshot,
  blockers: string[]
): Record<string, unknown> {
  return {
    schema: NARUTO_RESULT_SCHEMA,
    ok: false,
    completion_evidence: false,
    status: 'blocked',
    mission_id: missionId,
    workflow: 'official_codex_subagent',
    workflow_run_id: canonicalNarutoRunId(snapshot),
    reused: false,
    already_running: false,
    blockers
  }
}

function narutoArtifactIdentityBlockers(
  missionId: string,
  snapshot: NarutoAdmissionSnapshot
): string[] {
  const blockers: string[] = []
  if (!snapshot.mission.exists) blockers.push('naruto_mission_identity_conflict:mission_record_missing')
  else if (snapshot.mission.malformed) blockers.push('naruto_mission_identity_conflict:mission_record_malformed')
  else {
    if (narutoText(snapshot.mission.value?.id) !== missionId) {
      blockers.push('naruto_mission_identity_conflict:mission_record_id')
    }
    const mode = normalizeNarutoRoute(snapshot.mission.value?.mode)
    if (mode && mode !== 'naruto') blockers.push('naruto_mission_identity_conflict:mission_mode')
  }

  const artifacts: Array<[string, NarutoJsonArtifact, string]> = [
    [SUBAGENT_PLAN_FILENAME, snapshot.plan, 'sks.subagent-plan.v1'],
    [SUBAGENT_EVIDENCE_FILENAME, snapshot.evidence, 'sks.subagent-evidence.v1'],
    [SUBAGENT_PARENT_SUMMARY_FILENAME, snapshot.parentSummary, 'sks.subagent-parent-summary.v1'],
    [NARUTO_SUMMARY_FILENAME, snapshot.summary, NARUTO_RESULT_SCHEMA],
    [NARUTO_GATE_FILENAME, snapshot.gate, 'sks.naruto-gate.v1']
  ]
  for (const [name, artifact, schema] of artifacts) {
    if (!artifact.exists) continue
    if (artifact.malformed) {
      blockers.push('naruto_mission_identity_conflict:malformed:' + name)
      continue
    }
    if (artifact.value?.schema !== schema) {
      blockers.push('naruto_mission_identity_conflict:schema:' + name)
    }
    const artifactMissionId = narutoText(artifact.value?.mission_id)
    if (artifactMissionId && artifactMissionId !== missionId) {
      blockers.push('naruto_mission_identity_conflict:mission_id:' + name)
    }
    const workflow = narutoText(artifact.value?.workflow)
    if (workflow && workflow !== 'official_codex_subagent') {
      blockers.push('naruto_mission_identity_conflict:workflow:' + name)
    }
  }

  if (narutoArtifactRunIds(snapshot).length > 1) {
    blockers.push('naruto_mission_identity_conflict:workflow_run_id')
  }
  return uniqueStrings(blockers)
}

function narutoRequestIdentityBlockers(
  prompt: string,
  snapshot: NarutoAdmissionSnapshot
): string[] {
  if (!prompt || !snapshot.mission.value) return []
  const missionPrompt = narutoText(snapshot.mission.value.prompt)
  return missionPrompt && missionPrompt !== prompt
    ? ['naruto_mission_identity_conflict:mission_prompt']
    : []
}

function narutoArtifactRunIds(snapshot: NarutoAdmissionSnapshot): string[] {
  return uniqueStrings([
    narutoText(snapshot.plan.value?.workflow_run_id),
    narutoText(snapshot.evidence.value?.run_id),
    narutoText(snapshot.parentSummary.value?.run_id),
    narutoText(snapshot.summary.value?.workflow_run_id),
    narutoText(snapshot.gate.value?.workflow_run_id),
    ...snapshot.eventRunIds
  ])
}

function canonicalNarutoRunId(snapshot: NarutoAdmissionSnapshot): string | null {
  const runIds = narutoArtifactRunIds(snapshot)
  return runIds.length === 1 ? runIds[0] || null : null
}

function narutoEventRunIds(value: string): string[] {
  const values: string[] = []
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const row: unknown = JSON.parse(line)
      if (isNarutoRecord(row)) {
        values.push(narutoText(row.workflow_run_id), narutoText(row.run_id))
      }
    } catch {
      // A torn incomplete line is not an identity claim. The admitted owner
      // may reset it only after the live/terminal checks above pass.
    }
  }
  return uniqueStrings(values)
}

function normalizeNarutoRoute(value: unknown): string {
  return narutoText(value).replace(/^\$/, '').replace(/^sks-/, '').replace(/_/g, '-').toLowerCase()
}

function narutoArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function narutoText(value: unknown): string {
  return String(value || '').trim()
}

function isNarutoRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function narutoErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

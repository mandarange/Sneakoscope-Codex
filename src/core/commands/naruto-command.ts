import path from 'node:path'
import { ui as cliUi } from '../../cli/cli-theme.js'
import {
  createMission,
  findLatestMission,
  loadStateForSession,
  loadMission,
  setCurrent
} from '../mission.js'
import {
  closeWorkOrderLedgerForRouteResult,
  createAndWriteWorkOrderLedgerForPrompt
} from '../work-order-ledger.js'
import {
  exists,
  nowIso,
  readJson,
  sksRoot,
  writeJsonAtomic,
  writeTextAtomic
} from '../fsx.js'
import { classifyTaskProfile } from '../runtime/task-profile.js'
import { chooseVerificationBudget } from '../runtime/verification-budget.js'
import {
  DEFAULT_SUBAGENT_MODEL,
  NARUTO_PARENT_EFFORT,
  NARUTO_PARENT_MODEL,
  SUBAGENT_EFFORT,
  THINKING_SUBAGENT_MODEL
} from '../subagents/model-policy.js'
import { buildOfficialSubagentPrompt } from '../subagents/official-subagent-prompt.js'
import { readOfficialSubagentConfig } from '../subagents/official-subagent-config.js'
import {
  SUBAGENT_EVENT_LOG_FILENAME,
  normalizeSubagentParentSummary,
  readSubagentEvents,
  writeSubagentEvidence
} from '../subagents/subagent-evidence.js'
import { buildNarutoHelpResult } from '../subagents/naruto-help-contract.js'
import { resolveSubagentThreadBudget } from '../subagents/thread-budget.js'
import {
  codexAppSessionKey,
  detectCodexAppSession,
  runOfficialSubagentWorkflow
} from '../subagents/official-subagent-runner.js'

const NARUTO_RESULT_SCHEMA = 'sks.naruto-subagent-workflow.v1'
const SUBAGENT_PLAN_FILENAME = 'subagent-plan.json'
const NARUTO_SUMMARY_FILENAME = 'naruto-summary.json'
const NARUTO_GATE_FILENAME = 'naruto-gate.json'
const LEGACY_FLAG_WARNING = 'SKS: --clones is deprecated; use --agents. Naruto now uses Codex subagents.'
const LEGACY_WORKERS_WARNING = 'SKS: naruto workers is deprecated; use naruto subagents.'

type NarutoAction = 'run' | 'status' | 'subagents' | 'proof' | 'help'

export interface NarutoArgs {
  action: NarutoAction
  prompt: string
  requestedSubagents: number | undefined
  maxThreads: number | undefined
  missionId: string
  json: boolean
  readOnly: boolean
  clonesAliasUsed: boolean
  workersAliasUsed: boolean
  unsupportedLegacyFlags: string[]
  argumentErrors: string[]
}

export async function narutoCommand(commandOrArgs: string | string[] = 'naruto', maybeArgs: string[] = []) {
  const args = Array.isArray(commandOrArgs) ? commandOrArgs.map(String) : maybeArgs.map(String)
  if (process.env.SKS_NARUTO_LEGACY_PROCESS_SWARM === '1') {
    const legacy = await import('./naruto-command-legacy.js')
    return legacy.narutoCommand(args)
  }
  if (args.some((arg) => arg === '--glm' || arg.startsWith('--glm='))) return blockGlmOverride(args.includes('--json'))

  const parsed = parseNarutoArgs(args)
  if (parsed.clonesAliasUsed) console.warn(LEGACY_FLAG_WARNING)
  if (parsed.workersAliasUsed) console.warn(LEGACY_WORKERS_WARNING)
  if (parsed.argumentErrors.length) {
    return emit(parsed, argumentBlock(parsed.argumentErrors), () => {
      console.error(`$Naruto argument error: ${parsed.argumentErrors.join(', ')}`)
    }, true)
  }
  if (parsed.unsupportedLegacyFlags.length) {
    return emit(parsed, legacyFlagBlock(parsed.unsupportedLegacyFlags), () => {
      console.error('$Naruto uses the Codex official subagent workflow. Legacy process flags require SKS_NARUTO_LEGACY_PROCESS_SWARM=1.')
    }, true)
  }

  if (!parsed.json) cliUi.banner(parsed.action === 'run' ? 'naruto subagents' : `naruto ${parsed.action}`)
  if (parsed.action === 'help') return narutoHelp(parsed)
  if (parsed.action === 'status') return narutoStatus(parsed)
  if (parsed.action === 'subagents') return narutoSubagents(parsed)
  if (parsed.action === 'proof') return narutoProof(parsed)
  return narutoRun(parsed)
}

async function narutoRun(parsed: NarutoArgs) {
  const root = await sksRoot()
  const appSession = detectCodexAppSession()
  const sessionKey = appSession ? codexAppSessionKey() : null
  const taskProfile = classifyTaskProfile(parsed.prompt)
  const officialConfig = await readOfficialSubagentConfig(root)
  const budget = resolveSubagentThreadBudget({
    requested: parsed.requestedSubagents,
    configuredMaxThreads: parsed.maxThreads ?? officialConfig.maxThreads
  })
  const verification = chooseVerificationBudget({ taskProfile, changedFiles: [] })
  const configBlockers = officialConfig.blockers.map((blocker) => `official_subagent_config:${blocker}`)
  const delegationGoal = parsed.readOnly
    ? `${parsed.prompt}\n\nConstraint: run every delegated slice in read-only mode. Do not edit files.`
    : parsed.prompt
  const delegationPrompt = buildOfficialSubagentPrompt({
    goal: delegationGoal,
    slices: [],
    requestedSubagents: budget.requestedSubagents,
    maxThreads: budget.maxThreads,
    decompositionStatus: 'parent_required'
  })
  const mission = await resolveRunMission(root, parsed, sessionKey)
  if (!mission) {
    return emit(parsed, {
      schema: NARUTO_RESULT_SCHEMA,
      ok: false,
      status: 'blocked',
      blockers: [`naruto_mission_not_found:${parsed.missionId}`]
    }, () => console.error(`Naruto mission not found: ${parsed.missionId}`), true)
  }
  const { id, dir } = mission
  if (!(await exists(path.join(dir, 'work-order-ledger.json')))) {
    await createAndWriteWorkOrderLedgerForPrompt(dir, {
      missionId: id,
      route: 'Naruto',
      prompt: parsed.prompt
    })
  }
  if (!(await exists(path.join(dir, SUBAGENT_EVENT_LOG_FILENAME)))) {
    await writeTextAtomic(path.join(dir, SUBAGENT_EVENT_LOG_FILENAME), '')
  }

  const plan = {
    schema: 'sks.subagent-plan.v1',
    mission_id: id,
    route: '$Naruto',
    workflow: 'official_codex_subagent',
    goal: parsed.prompt,
    read_only: parsed.readOnly,
    task_profile: taskProfile,
    decomposition_status: 'parent_required',
    delegation_prompt: delegationPrompt,
    requested_subagents: budget.requestedSubagents,
    max_threads: budget.maxThreads,
    first_wave: budget.firstWave,
    wave_count: budget.waveCount,
    max_depth: budget.maxDepth,
    config_source: parsed.maxThreads === undefined ? officialConfig.sources.maxThreads : 'cli',
    config_blockers: officialConfig.blockers,
    slices: [],
    parent: {
      model: NARUTO_PARENT_MODEL,
      model_reasoning_effort: NARUTO_PARENT_EFFORT
    },
    agents: {
      worker: { model: DEFAULT_SUBAGENT_MODEL, model_reasoning_effort: SUBAGENT_EFFORT },
      expert: { model: THINKING_SUBAGENT_MODEL, model_reasoning_effort: SUBAGENT_EFFORT }
    },
    verification: { budget: verification },
    legacy_process_swarm_used: false,
    created_at: nowIso()
  }
  await writeJsonAtomic(path.join(dir, SUBAGENT_PLAN_FILENAME), plan)
  const preparationEvidence = await writeSubagentEvidence(dir, {
    requestedSubagents: budget.requestedSubagents,
    parentSummaryPresent: false,
    workflowStatus: 'delegation_context_ready',
    preparationOnly: true
  })
  await writeJsonAtomic(path.join(dir, NARUTO_SUMMARY_FILENAME), buildNarutoSummary({
    missionId: id,
    budget,
    evidence: preparationEvidence,
    verification,
    status: 'delegation_context_ready',
    ok: false,
    blockers: [...preparationEvidence.blockers, ...configBlockers]
  }))
  await writeNarutoGate(dir, {
    missionId: id,
    evidence: preparationEvidence,
    passed: false,
    blockers: [...preparationEvidence.blockers, ...configBlockers]
  })
  await setCurrent(root, {
    mission_id: id,
    route: 'Naruto',
    route_command: '$Naruto',
    mode: 'NARUTO',
    phase: 'NARUTO_DELEGATION_CONTEXT_READY',
    questions_allowed: false,
    implementation_allowed: true,
    subagents_required: true,
    subagents_verified: false,
    native_sessions_required: false,
    native_sessions_verified: false,
    requested_subagents: budget.requestedSubagents,
    max_threads: budget.maxThreads,
    max_depth: budget.maxDepth,
    stop_gate: NARUTO_GATE_FILENAME,
    naruto_gate_file: NARUTO_GATE_FILENAME,
    prompt: parsed.prompt
  }, { sessionKey })

  const run = await runOfficialSubagentWorkflow({
    root,
    prompt: delegationPrompt,
    requestedSubagents: budget.requestedSubagents,
    maxThreads: budget.maxThreads,
    appSession,
    sessionKey
  })
  const completedPlan = await readJson<any>(path.join(dir, SUBAGENT_PLAN_FILENAME), plan).catch(() => plan)
  const finalBudget = resolveSubagentThreadBudget({
    requested: Number(completedPlan?.requested_subagents || budget.requestedSubagents),
    configuredMaxThreads: Number(completedPlan?.max_threads || budget.maxThreads)
  })
  const evidence = await writeSubagentEvidence(dir, {
    requestedSubagents: finalBudget.requestedSubagents,
    parentSummary: run.parent_summary,
    parentSummaryPresent: Boolean(run.parent_summary),
    workflowStatus: run.status,
    preparationOnly: appSession
  })
  const passed = run.ok === true && evidence.ok === true && appSession === false
  const blockers = uniqueStrings([
    ...(Array.isArray(evidence.blockers) ? evidence.blockers : []),
    ...configBlockers,
    ...(!appSession && run.ok !== true ? [`codex_parent_exit:${String(run.codex_exit_code ?? 'unknown')}`] : []),
    ...(appSession ? ['official_subagent_execution_pending_in_current_parent'] : [])
  ])
  const status = passed
    ? 'completed'
    : appSession
      ? 'delegation_context_ready'
      : run.ok === true
        ? 'incomplete'
        : 'blocked'
  const summary = buildNarutoSummary({
    missionId: id,
    budget: finalBudget,
    evidence,
    verification,
    status,
    ok: passed,
    parentSummary: run.parent_summary,
    blockers,
    appSession,
    sessionKey
  })
  await writeJsonAtomic(path.join(dir, NARUTO_SUMMARY_FILENAME), summary)
  await writeNarutoGate(dir, { missionId: id, evidence, passed, blockers })
  await setCurrent(root, {
    mission_id: id,
    phase: passed ? 'NARUTO_COMPLETE' : appSession ? 'NARUTO_DELEGATION_CONTEXT_READY' : 'NARUTO_BLOCKED',
    subagents_verified: evidence.ok === true,
    requested_subagents: finalBudget.requestedSubagents,
    max_threads: finalBudget.maxThreads,
    naruto_gate_passed: passed,
    route_closed: false
  }, { sessionKey })
  if (!appSession) {
    await closeWorkOrderLedgerForRouteResult(dir, { ok: passed, blockers })
    if (!passed) process.exitCode = 1
  }

  const result = {
    ...summary,
    mission_id: id,
    additionalContext: appSession ? run.additionalContext : undefined,
    artifacts: {
      plan: SUBAGENT_PLAN_FILENAME,
      events: SUBAGENT_EVENT_LOG_FILENAME,
      evidence: 'subagent-evidence.json',
      summary: NARUTO_SUMMARY_FILENAME,
      gate: NARUTO_GATE_FILENAME
    }
  }
  return emit(parsed, result, () => renderRunResult(result))
}

async function narutoStatus(parsed: NarutoArgs) {
  const resolved = await resolveReadMission(parsed)
  if (!resolved) return missingMission(parsed, 'status')
  const [plan, evidence, summary, gate] = await Promise.all([
    readJson<any>(path.join(resolved.dir, SUBAGENT_PLAN_FILENAME), null),
    readJson<any>(path.join(resolved.dir, 'subagent-evidence.json'), null),
    readJson<any>(path.join(resolved.dir, NARUTO_SUMMARY_FILENAME), null),
    readJson<any>(path.join(resolved.dir, NARUTO_GATE_FILENAME), null)
  ])
  const result = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: Boolean(plan || evidence || summary || gate),
    action: 'status',
    mission_id: resolved.id,
    status: summary?.status || evidence?.status || 'prepared',
    requested_subagents: plan?.requested_subagents ?? evidence?.requested_subagents ?? null,
    max_threads: plan?.max_threads ?? null,
    started_subagents: evidence?.started_threads ?? 0,
    completed_subagents: evidence?.completed_threads ?? 0,
    failed_subagents: evidence?.failed_threads ?? 0,
    gate_passed: gate?.passed === true,
    blockers: gate?.blockers || evidence?.blockers || []
  }
  return emit(parsed, result, () => renderStatusResult(result))
}

async function narutoSubagents(parsed: NarutoArgs) {
  const resolved = await resolveReadMission(parsed)
  if (!resolved) return missingMission(parsed, 'subagents')
  const [evidence, events] = await Promise.all([
    readJson<any>(path.join(resolved.dir, 'subagent-evidence.json'), null),
    readSubagentEvents(resolved.dir)
  ])
  const result = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: Boolean(evidence),
    action: 'subagents',
    mission_id: resolved.id,
    requested_subagents: evidence?.requested_subagents ?? null,
    started_subagents: evidence?.started_threads ?? 0,
    completed_subagents: evidence?.completed_threads ?? 0,
    failed_subagents: evidence?.failed_threads ?? 0,
    started_thread_ids: evidence?.started_thread_ids || [],
    completed_thread_ids: evidence?.completed_thread_ids || [],
    failed_thread_ids: evidence?.failed_thread_ids || [],
    events
  }
  return emit(parsed, result, () => renderStatusResult(result))
}

async function narutoProof(parsed: NarutoArgs) {
  const resolved = await resolveReadMission(parsed)
  if (!resolved) return missingMission(parsed, 'proof')
  const [evidence, summary, gate] = await Promise.all([
    readJson<any>(path.join(resolved.dir, 'subagent-evidence.json'), null),
    readJson<any>(path.join(resolved.dir, NARUTO_SUMMARY_FILENAME), null),
    readJson<any>(path.join(resolved.dir, NARUTO_GATE_FILENAME), null)
  ])
  const result = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: gate?.passed === true && evidence?.ok === true,
    action: 'proof',
    mission_id: resolved.id,
    workflow: 'official_codex_subagent',
    evidence,
    summary,
    gate
  }
  return emit(parsed, result, () => {
    console.log(`Naruto proof ${resolved.id}: ${result.ok ? 'passed' : 'incomplete'}`)
    if (Array.isArray(gate?.blockers) && gate.blockers.length) console.log(`Blockers: ${gate.blockers.join(', ')}`)
  })
}

function narutoHelp(parsed: NarutoArgs) {
  const result = buildNarutoHelpResult()
  return emit(parsed, result, () => {
    console.log('$Naruto — Codex official subagent workflow')
    for (const line of result.usage) console.log(`  ${line}`)
  })
}

function buildNarutoSummary(input: any) {
  const parentSummary = normalizeSubagentParentSummary(input.parentSummary)
  return {
    schema: NARUTO_RESULT_SCHEMA,
    ok: input.ok === true,
    status: input.status,
    route: '$Naruto',
    workflow: 'official_codex_subagent',
    mission_id: input.missionId,
    parent: {
      model: NARUTO_PARENT_MODEL,
      model_reasoning_effort: NARUTO_PARENT_EFFORT
    },
    requested_subagents: input.budget.requestedSubagents,
    max_threads: input.budget.maxThreads,
    max_depth: input.budget.maxDepth,
    started_subagents: Number(input.evidence?.started_threads || 0),
    completed_subagents: Number(input.evidence?.completed_threads || 0),
    failed_subagents: Number(input.evidence?.failed_threads || 0),
    agents: {
      worker: { model: DEFAULT_SUBAGENT_MODEL, model_reasoning_effort: SUBAGENT_EFFORT },
      expert: { model: THINKING_SUBAGENT_MODEL, model_reasoning_effort: SUBAGENT_EFFORT }
    },
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

async function writeNarutoGate(dir: string, input: any) {
  await writeJsonAtomic(path.join(dir, NARUTO_GATE_FILENAME), {
    schema: 'sks.naruto-gate.v1',
    route: '$Naruto',
    workflow: 'official_codex_subagent',
    mission_id: input.missionId,
    passed: input.passed === true,
    subagent_evidence_ready: input.evidence?.ok === true,
    requested_subagents: input.evidence?.requested_subagents ?? null,
    started_subagents: Number(input.evidence?.started_threads || 0),
    completed_subagents: Number(input.evidence?.completed_threads || 0),
    failed_subagents: Number(input.evidence?.failed_threads || 0),
    parent_summary_present: input.evidence?.parent_summary_present === true,
    event_sources: input.evidence?.event_sources || [],
    native_process_proof_required: false,
    legacy_process_swarm_used: false,
    blockers: uniqueStrings(input.blockers || input.evidence?.blockers || []),
    updated_at: nowIso()
  })
}

async function resolveRunMission(root: string, parsed: NarutoArgs, sessionKey: string | null = null) {
  if (parsed.missionId && parsed.missionId !== 'latest') {
    const loaded = await loadMission(root, parsed.missionId).catch(() => null)
    return loaded ? { id: parsed.missionId, dir: loaded.dir } : null
  }
  if (sessionKey) {
    const state = await loadStateForSession(root, sessionKey).catch(() => null)
    const route = String(state?.route || state?.route_command || state?.mode || '').replace(/^\$/, '').toUpperCase()
    if (state?.mission_id && state?.route_closed !== true && route === 'NARUTO') {
      const loaded = await loadMission(root, state.mission_id).catch(() => null)
      if (loaded) return { id: state.mission_id, dir: loaded.dir }
    }
  }
  const created = await createMission(root, { mode: 'naruto', prompt: parsed.prompt, sessionKey })
  return { id: created.id, dir: created.dir }
}

async function resolveReadMission(parsed: NarutoArgs) {
  const root = await sksRoot()
  const id = parsed.missionId && parsed.missionId !== 'latest'
    ? parsed.missionId
    : await findLatestMission(root, { mode: 'naruto' })
  if (!id) return null
  const loaded = await loadMission(root, id).catch(() => null)
  return loaded ? { root, id, dir: loaded.dir } : null
}

export function parseNarutoArgs(args: string[]): NarutoArgs {
  const normalized = args.includes('--help') || args.includes('-h')
    ? ['help', ...args.filter((arg) => arg !== '--help' && arg !== '-h')]
    : args
  const first = normalized[0] && !normalized[0].startsWith('-') ? normalized[0] : ''
  const workersAliasUsed = first === 'workers'
  const actionName = workersAliasUsed ? 'subagents' : first
  const actions = new Set(['run', 'status', 'subagents', 'proof', 'help'])
  const action = (actions.has(actionName) ? actionName : 'run') as NarutoAction
  const explicitAction = actions.has(actionName) || workersAliasUsed
  const rest = explicitAction ? normalized.slice(1) : normalized
  const optionArgs = normalized.includes('--') ? normalized.slice(0, normalized.indexOf('--')) : normalized
  const agentsOption = optionValue(optionArgs, '--agents')
  const clonesOption = optionValue(optionArgs, '--clones')
  const maxThreadsOption = optionValue(optionArgs, '--max-threads')
  const missionOption = optionValue(optionArgs, '--mission')
  const missionIdOption = optionValue(optionArgs, '--mission-id')
  const argumentErrors = uniqueStrings([
    ...optionErrors('--agents', agentsOption, true),
    ...optionErrors('--clones', clonesOption, true),
    ...optionErrors('--max-threads', maxThreadsOption, true),
    ...optionErrors('--mission', missionOption, false),
    ...optionErrors('--mission-id', missionIdOption, false),
    ...(agentsOption.present && clonesOption.present ? ['conflicting_options:--agents,--clones'] : []),
    ...unknownOptionErrors(normalized)
  ])
  const requestedSubagents = strictPositiveInteger(agentsOption.value ?? clonesOption.value)
  const maxThreads = strictPositiveInteger(maxThreadsOption.value)
  const missionFlag = missionOption.value ?? missionIdOption.value
  const positional = positionalValues(rest)
  const positionalMission = action === 'status' || action === 'subagents' || action === 'proof'
    ? positional.find((value) => value === 'latest' || /^M-/.test(value))
    : undefined
  const prompt = action === 'run'
    ? positional.join(' ').trim()
    : ''
  if (action === 'run' && !prompt) argumentErrors.push('empty_task')
  return {
    action,
    prompt,
    requestedSubagents,
    maxThreads,
    missionId: String(missionFlag || positionalMission || 'latest'),
    json: normalized.includes('--json'),
    readOnly: normalized.includes('--readonly') || normalized.includes('--read-only'),
    clonesAliasUsed: clonesOption.present,
    workersAliasUsed,
    unsupportedLegacyFlags: unsupportedLegacyFlags(normalized),
    argumentErrors: uniqueStrings(argumentErrors)
  }
}

function positionalValues(args: string[]) {
  const valueFlags = new Set([
    '--agents', '--clones', '--max-threads', '--mission', '--mission-id',
    '--backend', '--concurrency', '--target-active-slots', '--work-items',
    '--write-mode', '--max-write-agents', '--service-tier', '--messages',
    '--parallelism', '--tournament', '--ollama-model', '--local-model-model',
    '--ollama-base-url', '--local-model-base-url'
  ])
  const booleanFlags = new Set([
    '--json', '--readonly', '--read-only', '--real', '--mock', '--no-open-zellij',
    '--no-zellij', '--attach', '--smoke', '--apply-patches', '--dry-run-patches',
    '--dry-run-patch', '--ollama', '--local-model', '--no-ollama', '--no-local-model',
    '--parallel-write', '--fast', '--no-fast'
  ])
  const result: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] || ''
    if (arg === '--') {
      result.push(...args.slice(index + 1))
      break
    }
    if (valueFlags.has(arg)) {
      index += 1
      continue
    }
    if ([...valueFlags].some((flag) => arg.startsWith(`${flag}=`))) continue
    if (booleanFlags.has(arg)) continue
    if (!arg.startsWith('--')) result.push(arg)
  }
  return result
}

function unsupportedLegacyFlags(args: string[]) {
  const optionArgs = args.includes('--') ? args.slice(0, args.indexOf('--')) : args
  const unsupportedBoolean = [
    '--mock', '--ollama', '--local-model', '--no-ollama', '--no-local-model',
    '--apply-patches', '--dry-run-patches', '--dry-run-patch', '--attach', '--smoke',
    '--parallel-write', '--fast', '--no-fast', '--real', '--no-open-zellij',
    '--no-zellij', '--incremental', '--mad'
  ]
  const unsupportedValues = [
    '--backend', '--concurrency', '--target-active-slots', '--work-items', '--write-mode',
    '--max-write-agents', '--service-tier', '--messages', '--parallelism', '--tournament',
    '--ollama-model', '--local-model-model', '--ollama-base-url', '--local-model-base-url',
    '--scheduler', '--scheduler-mode', '--pool', '--pool-size', '--model', '--parent-model',
    '--worker-model', '--expert-model', '--agent-model', '--clone-model', '--reasoning-effort',
    '--engine'
  ]
  const flags = unsupportedBoolean.filter((flag) => optionArgs.some((arg) => arg === flag || arg.startsWith(`${flag}=`)))
  for (const flag of unsupportedValues) {
    const option = optionValue(optionArgs, flag)
    if (option.present) flags.push(option.value === undefined ? flag : `${flag}=${option.value}`)
  }
  return uniqueStrings(flags)
}

function optionValue(args: string[], name: string): { present: boolean; value: string | undefined; missing: boolean; duplicate: boolean } {
  const values: Array<string | undefined> = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] || ''
    if (arg === name) {
      const next = args[index + 1]
      values.push(next && !next.startsWith('--') ? next : undefined)
      continue
    }
    if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1) || undefined)
  }
  return {
    present: values.length > 0,
    value: values.at(-1),
    missing: values.some((value) => value === undefined),
    duplicate: values.length > 1
  }
}

function strictPositiveInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (!/^\d+$/.test(String(value))) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function optionErrors(name: string, option: ReturnType<typeof optionValue>, numeric: boolean): string[] {
  const errors: string[] = []
  if (option.missing) errors.push(`missing_option_value:${name}`)
  if (option.duplicate) errors.push(`duplicate_option:${name}`)
  if (numeric && option.present && option.value !== undefined && strictPositiveInteger(option.value) === undefined) {
    errors.push(`invalid_positive_integer:${name}=${option.value}`)
  }
  return errors
}

function unknownOptionErrors(args: string[]): string[] {
  const canonical = new Set([
    '--agents', '--clones', '--max-threads', '--mission', '--mission-id',
    '--json', '--readonly', '--read-only', '--help', '-h', '--'
  ])
  const legacy = new Set([
    '--mock', '--ollama', '--local-model', '--no-ollama', '--no-local-model',
    '--apply-patches', '--dry-run-patches', '--dry-run-patch', '--attach', '--smoke',
    '--parallel-write', '--fast', '--no-fast', '--real', '--no-open-zellij',
    '--no-zellij', '--incremental', '--mad', '--glm', '--backend', '--concurrency',
    '--target-active-slots', '--work-items', '--write-mode', '--max-write-agents',
    '--service-tier', '--messages', '--parallelism', '--tournament', '--ollama-model',
    '--local-model-model', '--ollama-base-url', '--local-model-base-url', '--scheduler',
    '--scheduler-mode', '--pool', '--pool-size', '--model', '--parent-model', '--worker-model',
    '--expert-model', '--agent-model', '--clone-model', '--reasoning-effort', '--engine'
  ])
  const errors: string[] = []
  const optionArgs = args.includes('--') ? args.slice(0, args.indexOf('--')) : args
  for (const arg of optionArgs) {
    if (!arg.startsWith('-') || arg === '-') continue
    const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
    if (!canonical.has(name) && !legacy.has(name)) errors.push(`unsupported_argument:${name}`)
  }
  return errors
}

function blockGlmOverride(json: boolean) {
  const result = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: false,
    status: 'blocked',
    reason: 'naruto_gpt_5_6_family_only_glm_override_forbidden',
    blockers: ['naruto_gpt_5_6_family_only_glm_override_forbidden'],
    hint: 'Use normal sks naruto for the official Codex subagent workflow. The separate legacy GLM route requires sks --mad --glm --naruto.'
  }
  process.exitCode = 1
  if (json) console.log(JSON.stringify(result, null, 2))
  else console.error(`$Naruto blocked: ${result.reason}. ${result.hint}`)
  return result
}

function legacyFlagBlock(flags: string[]) {
  return {
    schema: NARUTO_RESULT_SCHEMA,
    ok: false,
    status: 'blocked',
    blockers: flags.map((flag) => `legacy_process_flag_requires_opt_in:${flag}`),
    hint: 'Set SKS_NARUTO_LEGACY_PROCESS_SWARM=1 only when explicitly using the compatibility process swarm.'
  }
}

function argumentBlock(errors: string[]) {
  return {
    schema: NARUTO_RESULT_SCHEMA,
    ok: false,
    status: 'blocked',
    reason: 'invalid_naruto_arguments',
    blockers: errors.map((error) => `invalid_naruto_argument:${error}`),
    hint: 'Provide a non-empty quoted task and valid positive integers for --agents/--max-threads. Use only official Naruto options.'
  }
}

function missingMission(parsed: NarutoArgs, action: string) {
  return emit(parsed, {
    schema: NARUTO_RESULT_SCHEMA,
    ok: false,
    action,
    status: 'missing_mission'
  }, () => console.log('No Naruto mission found.'))
}

function emit(parsed: Pick<NarutoArgs, 'json'>, result: any, human: () => void, failed = false) {
  if (failed) process.exitCode = 1
  if (parsed.json) console.log(JSON.stringify(result, null, 2))
  else human()
  return result
}

function renderRunResult(result: any) {
  console.log(`$Naruto ${result.status}: ${result.mission_id}`)
  console.log(`Official subagents: requested ${result.requested_subagents}, max threads ${result.max_threads}`)
  console.log(`Started/completed/failed: ${result.started_subagents}/${result.completed_subagents}/${result.failed_subagents}`)
  if (result.status === 'delegation_context_ready') console.log('Continue in the current Codex parent and wait for every requested subagent before summarizing.')
  if (Array.isArray(result.blockers) && result.blockers.length) console.log(`Blockers: ${result.blockers.join(', ')}`)
}

function renderStatusResult(result: any) {
  console.log(`Naruto ${result.action || 'status'}: ${result.mission_id}`)
  console.log(`Started/completed/failed: ${result.started_subagents || 0}/${result.completed_subagents || 0}/${result.failed_subagents || 0}`)
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

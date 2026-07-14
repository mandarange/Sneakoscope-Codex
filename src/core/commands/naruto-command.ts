import path from 'node:path'
import { ui as cliUi } from '../../cli/cli-theme.js'
import {
  createMission,
  findLatestMission,
  getOrCreateSessionMission,
  loadStateForSession,
  loadMission,
  sessionStateKey,
  setCurrent
} from '../mission.js'
import {
  closeWorkOrderLedgerForRouteResult,
  createAndWriteWorkOrderLedgerForPrompt
} from '../work-order-ledger.js'
import {
  appendJsonl,
  exists,
  nowIso,
  readJson,
  sksRoot,
  writeJsonAtomic
} from '../fsx.js'
import {
  SUBAGENT_EVENT_LOG_FILENAME,
  SUBAGENT_PARENT_SUMMARY_FILENAME,
  bindTrustworthySubagentParentSummaryToRun,
  persistOrReuseTrustworthySubagentParentSummary,
  readSubagentEvents,
  writeSubagentEvidence
} from '../subagents/subagent-evidence.js'
import { buildNarutoHelpResult } from '../subagents/naruto-help-contract.js'
import { withFileLock } from '../locks/file-lock.js'
import { resolveSubagentThreadBudget } from '../subagents/thread-budget.js'
import {
  codexAppSessionKey,
  detectCodexAppSession,
  runOfficialSubagentWorkflow
} from '../subagents/official-subagent-runner.js'
import {
  NARUTO_GATE_FILENAME,
  NARUTO_RESULT_SCHEMA,
  NARUTO_SUMMARY_FILENAME,
  SUBAGENT_PLAN_FILENAME,
  buildNarutoGateResult,
  buildNarutoSummary,
  prepareOfficialSubagentMission,
  writeNarutoGate
} from '../subagents/official-subagent-preparation.js'
import { recordOfficialSubagentParentOutcomesTelemetry } from '../zellij/zellij-official-subagent-telemetry.js'

export { buildNarutoGateResult } from '../subagents/official-subagent-preparation.js'

const LEGACY_FLAG_WARNING = 'SKS: --clones is deprecated; use --agents. Naruto now uses Codex subagents.'
const LEGACY_WORKERS_WARNING = 'SKS: naruto workers is deprecated; use naruto subagents.'
const REMOVED_LEGACY_SUBCOMMANDS = new Set(['dashboard'])

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
      console.error('$Naruto uses only the Codex official subagent workflow. Legacy process, scheduler, pool, backend, and model flags were removed.')
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
  if (appSession && sessionKey) {
    return withFileLock({
      lockPath: path.join(root, '.sneakoscope', 'state', `naruto-session-${sessionStateKey(sessionKey)}.lock`),
      timeoutMs: 20_000,
      staleMs: 120_000
    }, () => narutoRunTransaction(parsed, root, appSession, sessionKey))
  }
  return narutoRunTransaction(parsed, root, appSession, sessionKey)
}

async function narutoRunTransaction(
  parsed: NarutoArgs,
  root: string,
  appSession: boolean,
  sessionKey: string | null
) {
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
  if (appSession && sessionKey) {
    const pending = await readPendingAppNarutoRun(root, { id, dir }, sessionKey)
    if (pending) return emit(parsed, pending, () => renderRunResult(pending))
  }
  await createAndWriteWorkOrderLedgerForPrompt(dir, {
    missionId: id,
    route: 'Naruto',
    prompt: parsed.prompt
  })

  const preparation = await withFileLock({
    lockPath: path.join(dir, '.naruto-preparation.lock'),
    timeoutMs: 5_000,
    staleMs: 60_000
  }, () => prepareOfficialSubagentMission({
    root,
    dir,
    missionId: id,
    goal: parsed.prompt,
    route: '$Naruto',
    sessionScope: sessionKey,
    ...(parsed.requestedSubagents === undefined ? {} : { requestedSubagents: parsed.requestedSubagents }),
    requestedSubagentsExplicit: parsed.requestedSubagents !== undefined,
    ...(parsed.maxThreads === undefined ? {} : { maxThreads: parsed.maxThreads }),
    mode: 'naruto',
    readOnly: parsed.readOnly,
    preparationOnly: true
  }))
  const {
    plan,
    evidence: preparationEvidence,
    budget,
    verification,
    delegationPrompt,
    workflowRunId,
    configBlockers
  } = preparation
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
    agents_required: false,
    requested_subagents: budget.requestedSubagents,
    max_threads: budget.maxThreads,
    max_depth: budget.maxDepth,
    official_subagent_run_id: workflowRunId,
    session_scope: sessionKey,
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
    missionId: id,
    sessionKey
  })
  const completedPlan = await readJson<any>(path.join(dir, SUBAGENT_PLAN_FILENAME), plan).catch(() => plan)
  const finalBudget = resolveSubagentThreadBudget({
    requested: Number(completedPlan?.requested_subagents || budget.requestedSubagents),
    configuredMaxThreads: Number(completedPlan?.max_threads || budget.maxThreads)
  })
  const runBoundParentSummary = bindTrustworthySubagentParentSummaryToRun(run.parent_summary, workflowRunId)
  const effectiveParentSummary = await persistOrReuseTrustworthySubagentParentSummary(dir, runBoundParentSummary, {
    workflowStatus: run.status,
    runId: workflowRunId
  })
  const evidence = await writeSubagentEvidence(dir, {
    requestedSubagents: finalBudget.requestedSubagents,
    parentSummary: effectiveParentSummary,
    workflowStatus: run.status,
    preparationOnly: appSession,
    runId: workflowRunId,
    additionalBlockers: configBlockers
  })
  if (!appSession) {
    const parentTelemetry = await recordOfficialSubagentParentOutcomesTelemetry({
      root,
      routeMissionId: id,
      parentSummary: effectiveParentSummary,
      plan: completedPlan
    }).catch(async (error: any) => {
      await appendJsonl(path.join(dir, 'zellij-telemetry-warnings.jsonl'), {
        ts: nowIso(),
        warning: 'official_subagent_parent_outcome_telemetry_failed',
        error: String(error?.message || error)
      }).catch(() => undefined)
      return null
    })
    if (parentTelemetry?.blocker) {
      await appendJsonl(path.join(dir, 'zellij-telemetry-warnings.jsonl'), {
        ts: nowIso(),
        warning: 'official_subagent_parent_outcome_telemetry_incomplete',
        blocker: parentTelemetry.blocker,
        failed_mission_ids: 'failed_mission_ids' in parentTelemetry ? parentTelemetry.failed_mission_ids : [],
        skipped_thread_ids: 'skipped_thread_ids' in parentTelemetry ? parentTelemetry.skipped_thread_ids : []
      }).catch(() => undefined)
    }
  }
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
    workflowRunId,
    budget: finalBudget,
    evidence,
    verification,
    status,
    ok: passed,
    parentSummary: effectiveParentSummary,
    blockers,
    appSession,
    sessionKey,
    suggestedAgents: Array.isArray(completedPlan?.suggested_agents) ? completedPlan.suggested_agents : []
  })
  await writeJsonAtomic(path.join(dir, NARUTO_SUMMARY_FILENAME), summary)
  await writeNarutoGate(dir, { missionId: id, workflowRunId, evidence, passed, blockers })
  await setCurrent(root, {
    mission_id: id,
    official_subagent_run_id: workflowRunId,
    session_scope: sessionKey,
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
    attached_to_pending_run: false,
    additionalContext: appSession ? run.additionalContext : undefined,
    artifacts: narutoArtifactLinks(evidence)
  }
  return emit(parsed, result, () => renderRunResult(result))
}

async function readPendingAppNarutoRun(
  root: string,
  mission: { id: string; dir: string },
  sessionKey: string
) {
  const [plan, evidence, summary, gate, state] = await Promise.all([
    readJson<any>(path.join(mission.dir, SUBAGENT_PLAN_FILENAME), null),
    readJson<any>(path.join(mission.dir, 'subagent-evidence.json'), null),
    readJson<any>(path.join(mission.dir, NARUTO_SUMMARY_FILENAME), null),
    readJson<any>(path.join(mission.dir, NARUTO_GATE_FILENAME), null),
    loadStateForSession(root, sessionKey).catch(() => null)
  ])
  const workflowRunId = String(plan?.workflow_run_id || '').trim()
  const sessionMatches = state?._session_key === sessionStateKey(sessionKey)
  const pending = Boolean(
    workflowRunId
      && plan?.schema === 'sks.subagent-plan.v1'
      && plan?.workflow === 'official_codex_subagent'
      && plan?.mission_id === mission.id
      && plan?.session_scope === sessionKey
      && evidence?.run_id === workflowRunId
      && evidence?.preparation_only === true
      && evidence?.ok !== true
      && summary?.workflow_run_id === workflowRunId
      && summary?.mission_id === mission.id
      && summary?.app_session === true
      && summary?.session_scope === sessionKey
      && summary?.status === 'delegation_context_ready'
      && summary?.ok !== true
      && summary?.completion_evidence !== true
      && gate?.workflow_run_id === workflowRunId
      && gate?.mission_id === mission.id
      && gate?.passed !== true
      && sessionMatches
      && state?.mission_id === mission.id
      && state?.official_subagent_run_id === workflowRunId
      && state?.session_scope === sessionKey
      && state?.route_closed !== true
      && state?.phase === 'NARUTO_DELEGATION_CONTEXT_READY'
  )
  if (!pending) return null

  return {
    ...summary,
    schema: NARUTO_RESULT_SCHEMA,
    ok: false,
    completion_evidence: false,
    status: 'delegation_context_ready',
    workflow_run_id: workflowRunId,
    mission_id: mission.id,
    app_session: true,
    session_scope: sessionKey,
    attached_to_pending_run: true,
    additionalContext: plan.delegation_prompt,
    artifacts: narutoArtifactLinks(evidence)
  }
}

function narutoArtifactLinks(evidence: any) {
  return {
    plan: SUBAGENT_PLAN_FILENAME,
    events: SUBAGENT_EVENT_LOG_FILENAME,
    parent_summary: evidence?.parent_summary_trustworthy === true ? SUBAGENT_PARENT_SUMMARY_FILENAME : null,
    evidence: 'subagent-evidence.json',
    summary: NARUTO_SUMMARY_FILENAME,
    gate: NARUTO_GATE_FILENAME
  }
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
    console.log(`Parent: ${result.parent.model} / ${result.parent.model_reasoning_effort}`)
    const worker = result.agents.worker
    const expert = result.agents.expert
    if (worker) console.log(`Worker: ${worker.model} / ${worker.model_reasoning_effort}`)
    if (expert) console.log(`Expert: ${expert.model} / ${expert.model_reasoning_effort}`)
    console.log(`Default children: ${result.default_requested_subagents}; use explicit --agents N for wider parallelism`)
    console.log(`Nesting: max_depth=${result.max_depth}; subagents must not spawn subagents`)
    console.log('Context: bounded TriWiki attention.use_first anchors with on-demand source hydration')
    console.log('Evidence: SubagentStop is lifecycle-only; completion requires subagent-parent-summary.json with one structured outcome per thread.')
  })
}

async function resolveRunMission(root: string, parsed: NarutoArgs, sessionKey: string | null = null) {
  if (parsed.missionId && parsed.missionId !== 'latest') {
    const loaded = await loadMission(root, parsed.missionId).catch(() => null)
    return loaded ? { id: parsed.missionId, dir: loaded.dir } : null
  }
  if (sessionKey) {
    const resolved = await getOrCreateSessionMission(root, {
      mode: 'naruto',
      prompt: parsed.prompt,
      sessionKey,
      selectMissionId: (state) => {
        const route = String(state?.route || state?.route_command || state?.mode || '').replace(/^\$/, '').toUpperCase()
        const sessionMatches = state?._session_key === sessionStateKey(sessionKey)
        return sessionMatches && state?.mission_id && state?.route_closed !== true && route === 'NARUTO'
          ? String(state.mission_id)
          : null
      }
    })
    return { id: resolved.id, dir: resolved.dir }
  }
  const created = await createMission(root, { mode: 'naruto', prompt: parsed.prompt, sessionKey })
  return { id: created.id, dir: created.dir }
}

async function resolveReadMission(parsed: NarutoArgs) {
  const root = await sksRoot()
  const explicitId = parsed.missionId && parsed.missionId !== 'latest' ? parsed.missionId : null
  const sessionKey = detectCodexAppSession() ? codexAppSessionKey() : null
  let id = explicitId
  if (!id && sessionKey) {
    const state = await loadStateForSession(root, sessionKey).catch(() => null)
    const route = String(state?.route || state?.route_command || state?.mode || '').replace(/^\$/, '').toUpperCase()
    if (state?._session_key === sessionStateKey(sessionKey) && state?.route_closed !== true && route === 'NARUTO') {
      id = String(state.mission_id || '') || null
    }
  }
  if (!id && !sessionKey) id = await findLatestMission(root, { mode: 'naruto' })
  if (!id) return null
  const loaded = await loadMission(root, id).catch(() => null)
  return loaded ? { root, id, dir: loaded.dir } : null
}

export function parseNarutoArgs(args: string[]): NarutoArgs {
  const helpRequested = args.includes('--help') || args.includes('-h')
  const validationArgs = [...args]
  const normalized = helpRequested
    ? ['help', ...(args.includes('--json') ? ['--json'] : [])]
    : args
  const first = normalized[0] && !normalized[0].startsWith('-') ? normalized[0] : ''
  const workersAliasUsed = first === 'workers'
  const actionName = workersAliasUsed ? 'subagents' : first
  const actions = new Set(['run', 'status', 'subagents', 'proof', 'help'])
  const action = (actions.has(actionName) ? actionName : 'run') as NarutoAction
  const explicitAction = actions.has(actionName) || workersAliasUsed
  const rest = explicitAction ? normalized.slice(1) : normalized
  const optionArgs = validationArgs.includes('--') ? validationArgs.slice(0, validationArgs.indexOf('--')) : validationArgs
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
    ...booleanOptionErrors(validationArgs),
    ...unknownOptionErrors(validationArgs)
  ])
  if (REMOVED_LEGACY_SUBCOMMANDS.has(String(first || '').toLowerCase())) {
    argumentErrors.push(`removed_legacy_subcommand:${String(first).toLowerCase()}`)
  }
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
  const positionalHead = String(positional[0] || '').toLowerCase()
  const subcommandNames = new Set(['run', 'status', 'subagents', 'workers', 'proof', 'help'])
  if (explicitAction && action === 'run' && REMOVED_LEGACY_SUBCOMMANDS.has(positionalHead)) {
    argumentErrors.push(`removed_legacy_subcommand:${positionalHead}`)
  } else if (explicitAction && action === 'run' && subcommandNames.has(positionalHead)) {
    argumentErrors.push(`misplaced_subcommand:${positionalHead}`)
  } else if (!explicitAction && REMOVED_LEGACY_SUBCOMMANDS.has(positionalHead)) {
    argumentErrors.push(`removed_legacy_subcommand:${positionalHead}`)
  } else if (!explicitAction && subcommandNames.has(positionalHead)) {
    argumentErrors.push(`misplaced_subcommand:${positionalHead}`)
  }
  if (action !== 'run') {
    let missionConsumed = false
    for (const value of positional) {
      if (!missionConsumed && positionalMission !== undefined && value === positionalMission) {
        missionConsumed = true
        continue
      }
      const normalizedValue = String(value || '').toLowerCase()
      if (REMOVED_LEGACY_SUBCOMMANDS.has(normalizedValue)) {
        argumentErrors.push(`removed_legacy_subcommand:${normalizedValue}`)
      } else if (subcommandNames.has(normalizedValue)) {
        argumentErrors.push(`misplaced_subcommand:${normalizedValue}`)
      } else {
        argumentErrors.push(`unexpected_positional:${value}`)
      }
    }
  }
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
    unsupportedLegacyFlags: unsupportedLegacyFlags(validationArgs),
    argumentErrors: uniqueStrings(argumentErrors)
  }
}

function positionalValues(args: string[]) {
  const valueFlags = new Set([
    '--agents', '--clones', '--max-threads', '--mission', '--mission-id',
    '--backend', '--concurrency', '--target-active-slots', '--work-items',
    '--write-mode', '--max-write-agents', '--service-tier', '--messages',
    '--parallelism', '--tournament', '--ollama-model', '--local-model-model',
    '--ollama-base-url', '--local-model-base-url', '--scheduler', '--scheduler-mode',
    '--pool', '--pool-size', '--model', '--parent-model', '--worker-model',
    '--expert-model', '--agent-model', '--clone-model', '--reasoning-effort', '--engine'
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

function booleanOptionErrors(args: string[]): string[] {
  const booleanNames = new Set(['--json', '--readonly', '--read-only', '--help', '-h'])
  const optionArgs = args.includes('--') ? args.slice(0, args.indexOf('--')) : args
  const errors: string[] = []
  for (const arg of optionArgs) {
    if (!arg.includes('=')) continue
    const name = arg.slice(0, arg.indexOf('='))
    if (booleanNames.has(name)) errors.push(`boolean_option_value_not_supported:${name}`)
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
    blockers: flags.map((flag) => `removed_legacy_process_flag:${flag}`),
    hint: 'Naruto supports only the Codex official subagent workflow. Use --agents, --max-threads, --read-only, --mission, or --json.'
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

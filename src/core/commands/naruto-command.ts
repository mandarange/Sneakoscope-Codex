import path from 'node:path'
import { createMission, findLatestMission, loadMission } from '../mission.js'
import { readJson, sksRoot, writeJsonAtomic } from '../fsx.js'
import { runNativeAgentOrchestrator } from '../agents/agent-orchestrator.js'
import { classifyOllamaWorkerSlice } from '../agents/agent-runner-ollama.js'
import { buildNarutoCloneRoster, systemSafeNarutoConcurrency } from '../agents/agent-roster.js'
import { DEFAULT_NARUTO_CLONES, MAX_NARUTO_AGENT_COUNT } from '../agents/agent-schema.js'
import { resolveOllamaWorkerConfig } from '../agents/ollama-worker-config.js'
import { attachZellijSessionInteractive, launchZellijLayout } from '../zellij/zellij-launcher.js'
import { buildNarutoWorkGraph } from '../naruto/naruto-work-graph.js'
import { buildNarutoRoleDistribution } from '../naruto/naruto-role-policy.js'
import { decideNarutoConcurrency } from '../naruto/naruto-concurrency-governor.js'
import { simulateNarutoActivePool } from '../naruto/naruto-active-pool.js'
import { buildNarutoVerificationDag } from '../naruto/naruto-verification-dag.js'
import { buildNarutoGptFinalPack } from '../naruto/naruto-gpt-final-pack.js'
import { planNarutoZellijDashboard } from '../zellij/zellij-naruto-dashboard.js'
import { checkPromptPlaceholders } from '../prompt/prompt-placeholder-guard.js'

const NARUTO_RESULT_SCHEMA = 'sks.naruto-command-result.v1'
const NARUTO_ROUTE = '$Naruto'

// $Naruto — Shadow Clone Swarm (影分身 / Kage Bunshin no Jutsu).
// A high-scale variant of the native agent orchestrator that fans out up to
// MAX_NARUTO_AGENT_COUNT (100) identical clone sessions in parallel, reusing the
// proven scheduler / work-queue / patch-swarm machinery (lease-based safe parallel
// writes). The standard 20-agent ceiling is lifted only for this route.
export async function narutoCommand(commandOrArgs: string | string[] = 'naruto', maybeArgs: string[] = []) {
  const args = Array.isArray(commandOrArgs) ? commandOrArgs : maybeArgs
  const parsed = parseNarutoArgs(args)
  if (parsed.action === 'help') return narutoHelp(parsed)
  if (parsed.action === 'status') return narutoStatus(parsed)
  return narutoRun(parsed)
}

async function narutoRun(parsed: NarutoArgs) {
  const root = await sksRoot()
  const writeCapable = parsed.readonly !== true && parsed.writeMode !== 'off'
  const placeholderGuard = checkPromptPlaceholders({
    prompt: parsed.prompt,
    writeCapable,
    targetPaths: writeCapable ? ['.sneakoscope/naruto/patch-envelopes'] : []
  })
  if (!placeholderGuard.ok) {
    return emit(parsed, {
      schema: NARUTO_RESULT_SCHEMA,
      ok: false,
      mode: 'NARUTO',
      action: 'run',
      status: 'blocked',
      prompt_placeholder_guard: placeholderGuard,
      blockers: placeholderGuard.blockers
    }, () => {
      console.log('$Naruto blocked before work graph creation: unresolved prompt placeholder or empty write target path.')
      for (const blocker of placeholderGuard.blockers) console.log('- ' + blocker)
    })
  }
  const roster = buildNarutoCloneRoster({
    clones: parsed.clones,
    prompt: parsed.prompt,
    readonly: parsed.readonly,
    maxAgentCount: MAX_NARUTO_AGENT_COUNT
  })
  // The clone roster is the full work fan-out; live concurrency is throttled to a
  // system-safe number so naruto never spawns the whole count at once unless an
  // explicit operator override asks for a higher target.
  const localWorker = await resolveNarutoLocalWorkerMode(parsed)
  const schedulerBackend = localWorker.auto_select_eligible ? 'ollama' : parsed.backend
  const safe = systemSafeNarutoConcurrency({ backend: schedulerBackend })
  const workGraph = buildNarutoWorkGraph({
    prompt: parsed.prompt,
    requestedClones: roster.agent_count,
    totalWorkItems: parsed.workItems,
    readonly: parsed.readonly,
    writeCapable,
    targetPaths: ['.sneakoscope/naruto/patch-envelopes'],
    maxActiveWorkers: parsed.concurrency || safe.cap
  })
  const roleDistribution = buildNarutoRoleDistribution(workGraph.work_items, { readonly: parsed.readonly })
  const governor = decideNarutoConcurrency({
    requestedClones: roster.agent_count,
    totalWorkItems: workGraph.total_work_items,
    pendingWorkQueueSize: workGraph.total_work_items,
    backend: schedulerBackend
  })
  const backendMinimum = schedulerBackend === 'fake' ? roster.agent_count : Math.min(roster.agent_count, 2)
  const activeSlots = Math.max(1, Math.min(roster.agent_count, parsed.concurrency || Math.max(governor.safe_active_workers, backendMinimum), safe.cap))
  const zellijVisiblePanes = Math.max(1, Math.min(activeSlots, governor.safe_zellij_visible_panes))
  const activePool = simulateNarutoActivePool({ graph: workGraph, governor: { ...governor, safe_active_workers: activeSlots } })
  const verificationDag = buildNarutoVerificationDag(workGraph, { cwd: root })
  const gptFinalPack = buildNarutoGptFinalPack({
    missionId: 'pending',
    graph: workGraph,
    roleDistribution,
    localLlmMetrics: localWorker
  })
  const zellijDashboard = planNarutoZellijDashboard({
    targetActiveWorkers: activeSlots,
    visiblePaneCap: governor.safe_zellij_visible_panes,
    backpressure: governor.backpressure,
    roles: roleDistribution.work_item_roles.map((row) => row.role),
    backend: schedulerBackend
  })
  const mission = await createMission(root, { mode: 'naruto', prompt: parsed.prompt })
  const ledgerRoot = path.join(mission.dir, 'agents')
  await writeNarutoArtifacts(ledgerRoot, {
    workGraph,
    roleDistribution,
    governor,
    activePool,
    verificationDag,
    gptFinalPack: { ...gptFinalPack, mission_id: mission.id },
    zellijDashboard,
    placeholderGuard
  })
  let liveZellij: any = null
  if (!parsed.json && !parsed.mock && !parsed.noOpenZellij) {
    liveZellij = await launchZellijLayout({
      root,
      missionId: mission.id,
      ledgerRoot,
      kind: 'naruto',
      slotCount: zellijVisiblePanes,
      dryRun: false,
      attach: false
    })
    if (liveZellij?.ok && liveZellij.capability?.status === 'ok') {
      console.log('Zellij: prepared ' + zellijVisiblePanes + ' visible active clone lane(s) in ' + liveZellij.session_name + ' with ' + Math.max(0, activeSlots - zellijVisiblePanes) + ' headless active worker(s). Attach with: ' + (liveZellij.attach_command_with_env || liveZellij.attach_command))
      if (parsed.attach) attachZellijSessionInteractive(liveZellij.session_name, { cwd: process.cwd(), configPath: liveZellij.clipboard_config_path })
    } else if (liveZellij?.ok) {
      console.log('Zellij: optional live panes unavailable (' + ((liveZellij.warnings || []).join('; ') || liveZellij.capability?.status || 'unknown') + ')')
    } else {
      console.log('Zellij: blocked (' + Array.from(new Set(liveZellij?.blockers || [])).join('; ') + ')')
    }
  }
  const result = await runNativeAgentOrchestrator({
    missionId: mission.id,
    prompt: parsed.prompt,
    route: NARUTO_ROUTE,
    routeCommand: 'sks naruto run',
    routeBlackboxKind: 'actual_naruto_command',
    roster,
    agents: roster.agent_count,
    concurrency: activeSlots,
    targetActiveSlots: activeSlots,
    visualLaneCount: zellijVisiblePanes,
    desiredWorkItemCount: parsed.workItems,
    maxAgentCount: MAX_NARUTO_AGENT_COUNT,
    narutoMode: true,
    clones: roster.agent_count,
    backend: parsed.backend,
    backendExplicit: parsed.backendExplicit,
    noOllama: parsed.noOllama,
    ollamaEnabled: parsed.ollamaEnabled,
    ollamaModel: parsed.ollamaModel,
    ollamaBaseUrl: parsed.ollamaBaseUrl,
    mock: parsed.mock,
    real: parsed.real,
    readonly: parsed.readonly,
    // Shadow clones ALWAYS run in fast service tier — never honor --no-fast/standard.
    fastMode: true,
    serviceTier: 'fast',
    noFast: false,
    ...(parsed.writeMode ? { writeMode: parsed.writeMode } : {}),
    json: parsed.json
  })
  const clones = result.roster?.agent_count ?? roster.agent_count
  const localWorkerSummary = summarizeNarutoLocalWorkerResult(localWorker, result)
  const summary = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: result.ok === true,
    mode: 'NARUTO',
    jutsu: 'kage_bunshin_no_jutsu',
    mission_id: result.mission_id,
    backend: result.backend,
    clones,
    max_clones: MAX_NARUTO_AGENT_COUNT,
    concurrency: result.target_active_slots ?? activeSlots,
    target_active_slots: result.target_active_slots ?? activeSlots,
    concurrency_capped: clones > (result.target_active_slots ?? activeSlots),
    system: { cores: safe.cores, free_gb: safe.free_gb, safe_concurrency: safe.cap, heavy_backend: safe.heavy },
    work_graph: {
      total_work_items: workGraph.total_work_items,
      mixed_work_kinds: workGraph.mixed_work_kinds,
      write_allowed_count: workGraph.write_allowed_count,
      ok: workGraph.ok
    },
    role_distribution: roleDistribution,
    concurrency_governor: governor,
    active_pool: {
      ok: activePool.ok,
      max_observed_active_workers: activePool.max_observed_active_workers,
      refill_events: activePool.refill_events,
      completed_count: activePool.completed_count
    },
    local_worker: localWorkerSummary,
    proof: result.proof?.status || 'missing',
    run: result,
    zellij: null as any
  }
  summary.zellij = liveZellij
  return emit(parsed, summary, () => {
    console.log('🍥 Shadow Clone Jutsu — Kage Bunshin no Jutsu')
    console.log('Mission: ' + result.mission_id)
    console.log('Clones: ' + summary.clones + ' / max ' + MAX_NARUTO_AGENT_COUNT + ', running ' + summary.target_active_slots + ' at a time' + (summary.concurrency_capped ? ` (throttled to host capacity: ${safe.cores} cores, ${safe.free_gb} GB free)` : ''))
    console.log('Backend: ' + result.backend)
    console.log('Roles: ' + roleDistribution.entries.map((entry) => `${entry.role}:${entry.count}`).join(', '))
    console.log('Proof: ' + summary.proof)
    if (summary.zellij?.ok && summary.zellij.capability?.status === 'ok') console.log('Zellij: prepared ' + zellijVisiblePanes + ' visible active clone lane(s) in ' + summary.zellij.session_name + '; dashboard tracks ' + Math.max(0, activeSlots - zellijVisiblePanes) + ' headless active worker(s)')
    else if (summary.zellij?.ok) console.log('Zellij: optional live panes unavailable (' + ((summary.zellij.warnings || []).join('; ') || summary.zellij.capability?.status || 'unknown') + ')')
  })
}

function summarizeNarutoLocalWorkerResult(localWorker: any, result: any) {
  const backendCounts: Record<string, number> = {}
  const rows = Array.isArray(result?.results) ? result.results : []
  for (const row of rows) {
    const selected = String(row?.backend_router_report?.selected_backend || row?.backend || 'unknown')
    backendCounts[selected] = (backendCounts[selected] || 0) + 1
  }
  return {
    ...localWorker,
    selected_worker_count: backendCounts.ollama || 0,
    backend_counts: backendCounts
  }
}

async function narutoStatus(parsed: NarutoArgs) {
  const root = await sksRoot()
  const id = parsed.missionId && parsed.missionId !== 'latest' ? parsed.missionId : await findLatestMission(root)
  if (!id) return emit(parsed, { schema: NARUTO_RESULT_SCHEMA, ok: false, action: 'status', status: 'missing_mission' }, () => console.log('No Naruto mission found.'))
  const { dir } = await loadMission(root, id)
  const proof = await readJson<any>(path.join(dir, 'agents', 'agent-proof-evidence.json'), null)
  const scheduler = await readJson<any>(path.join(dir, 'agents', 'agent-scheduler-state.json'), null)
  const roleDistribution = await readJson<any>(path.join(dir, 'agents', 'naruto-role-distribution.json'), null)
  const workGraph = await readJson<any>(path.join(dir, 'agents', 'naruto-work-graph.json'), null)
  const governor = await readJson<any>(path.join(dir, 'agents', 'naruto-concurrency-governor.json'), null)
  const summary = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: proof !== null,
    action: 'status',
    mission_id: id,
    proof: proof?.status || 'missing',
    target_active_slots: scheduler?.target_active_slots ?? null,
    max_active_slots: scheduler?.max_active_slots ?? null,
    completed: scheduler?.completed_count ?? null,
    role_distribution: roleDistribution,
    work_graph: workGraph ? {
      total_work_items: workGraph.total_work_items,
      mixed_work_kinds: workGraph.mixed_work_kinds,
      write_allowed_count: workGraph.write_allowed_count
    } : null,
    concurrency_governor: governor
  }
  return emit(parsed, summary, () => {
    console.log('🍥 Naruto mission: ' + id)
    console.log('Proof: ' + summary.proof)
    if (summary.target_active_slots !== null) console.log('Active clones: ' + summary.target_active_slots + ' / max ' + summary.max_active_slots)
    if (roleDistribution?.entries) console.log('Roles: ' + roleDistribution.entries.map((entry: any) => `${entry.role}:${entry.count}`).join(', '))
  })
}

async function narutoHelp(parsed: NarutoArgs) {
  const help = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: true,
    action: 'help',
    mode: 'NARUTO',
    description: 'Shadow Clone Swarm: fan out up to ' + MAX_NARUTO_AGENT_COUNT + ' parallel clone sessions.',
    usage: [
      'sks naruto run "<task>" [--clones N] [--backend codex-sdk|fake|ollama] [--local-model|--no-ollama] [--work-items N] [--real] [--readonly] [--json]',
      'sks naruto status [--mission <id>] [--json]'
    ],
    defaults: { clones: DEFAULT_NARUTO_CLONES, max_clones: MAX_NARUTO_AGENT_COUNT, backend: 'codex-sdk' }
  }
  return emit(parsed, help, () => {
    console.log('🍥 $Naruto — Shadow Clone Swarm (影分身)')
    console.log(help.description)
    for (const line of help.usage) console.log('  ' + line)
  })
}

interface NarutoArgs {
  action: 'run' | 'status' | 'help'
  prompt: string
  clones: number
  workItems: number
  concurrency: number | null
  backend: string
  backendExplicit: boolean
  mock: boolean
  real: boolean
  readonly: boolean
  ollamaEnabled: boolean
  noOllama: boolean
  ollamaModel: string | null
  ollamaBaseUrl: string | null
  writeMode: 'proof-safe' | 'parallel' | 'serial' | 'off' | null
  json: boolean
  missionId: string
  noOpenZellij: boolean
  attach: boolean
}

function parseNarutoArgs(args: string[] = []): NarutoArgs {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) args = ['help', ...args.filter((arg) => arg !== '--help' && arg !== '-h')]
  const first = args[0] && !String(args[0]).startsWith('--') ? String(args[0]) : ''
  const actions = new Set(['run', 'status', 'help'])
  const action = (actions.has(first) ? first : 'run') as NarutoArgs['action']
  const rest = action === first ? args.slice(1) : args
  const json = hasFlag(args, '--json')
  const requestedClones = Number(readOption(args, '--clones', readOption(args, '--agents', DEFAULT_NARUTO_CLONES)))
  const clones = clampClones(requestedClones)
  const workItems = clampWorkItems(Number(readOption(args, '--work-items', clones)), clones)
  const concurrency = normalizeConcurrency(readOption(args, '--concurrency', readOption(args, '--target-active-slots', null)), clones)
  const useOllama = hasFlag(args, '--ollama') || hasFlag(args, '--local-model')
  const noOllama = hasFlag(args, '--no-ollama') || hasFlag(args, '--no-local-model')
  const backendExplicit = hasOption(args, '--backend') || useOllama || noOllama
  const backend = String(readOption(args, '--backend', hasFlag(args, '--mock') ? 'fake' : useOllama && !noOllama ? 'ollama' : 'codex-sdk'))
  const mock = hasFlag(args, '--mock') || backend === 'fake'
  const real = hasFlag(args, '--real')
  const readonly = hasFlag(args, '--readonly') || hasFlag(args, '--read-only')
  const writeModeRaw = String(readOption(args, '--write-mode', hasFlag(args, '--parallel-write') ? 'parallel' : '') || '')
  const writeMode = (['proof-safe', 'parallel', 'serial', 'off'].includes(writeModeRaw) ? writeModeRaw : null) as NarutoArgs['writeMode']
  const missionId = String(readOption(args, '--mission', readOption(args, '--mission-id', 'latest')))
  const ollamaModel = String(readOption(args, '--ollama-model', readOption(args, '--local-model-model', '')) || '') || null
  const ollamaBaseUrl = String(readOption(args, '--ollama-base-url', readOption(args, '--local-model-base-url', '')) || '') || null
  const noOpenZellij = hasFlag(args, '--no-open-zellij') || hasFlag(args, '--no-zellij')
  const attach = hasFlag(args, '--attach')
  const valueFlags = new Set(['--clones', '--agents', '--work-items', '--concurrency', '--target-active-slots', '--backend', '--write-mode', '--mission', '--mission-id', '--ollama-model', '--local-model-model', '--ollama-base-url', '--local-model-base-url'])
  const prompt = positionalArgs(rest, valueFlags).join(' ').trim() || 'Naruto shadow clone swarm run'
  return { action, prompt, clones, workItems, concurrency, backend, backendExplicit, mock, real, readonly, ollamaEnabled: useOllama && !noOllama, noOllama, ollamaModel, ollamaBaseUrl, writeMode, json, missionId, noOpenZellij, attach }
}

async function writeNarutoArtifacts(ledgerRoot: string, artifacts: {
  workGraph: any
  roleDistribution: any
  governor: any
  activePool: any
  verificationDag: any
  gptFinalPack: any
  zellijDashboard: any
  placeholderGuard: any
}) {
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-work-graph.json'), artifacts.workGraph)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-role-distribution.json'), artifacts.roleDistribution)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-concurrency-governor.json'), artifacts.governor)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-active-pool.json'), artifacts.activePool)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-verification-dag.json'), artifacts.verificationDag)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-gpt-final-pack.json'), artifacts.gptFinalPack)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-zellij-dashboard.json'), artifacts.zellijDashboard)
  await writeJsonAtomic(path.join(ledgerRoot, 'prompt-placeholder-guard.json'), artifacts.placeholderGuard)
}

function clampClones(value: number): number {
  if (!Number.isFinite(value) || value < 1) return DEFAULT_NARUTO_CLONES
  return Math.min(MAX_NARUTO_AGENT_COUNT, Math.floor(value))
}

function clampWorkItems(value: number, clones: number): number {
  if (!Number.isFinite(value) || value < 1) return clones
  return Math.floor(value)
}

function normalizeConcurrency(value: unknown, clones: number): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return null
  return Math.min(Math.floor(parsed), clones, MAX_NARUTO_AGENT_COUNT)
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag)
}

function readOption(args: string[], name: string, fallback: unknown) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1]
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='))
  return prefixed ? prefixed.slice(name.length + 1) : fallback
}

function hasOption(args: string[], name: string) {
  return args.includes(name) || args.some((arg) => String(arg).startsWith(name + '='))
}

function positionalArgs(args: string[], valueFlags: Set<string>) {
  const out: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i])
    if (arg.startsWith('--')) {
      if (valueFlags.has(arg) && args[i + 1] && !String(args[i + 1]).startsWith('--')) i += 1
      continue
    }
    out.push(arg)
  }
  return out
}

function emit(parsed: NarutoArgs, result: any, text: () => void) {
  if (parsed.json) {
    console.log(JSON.stringify(result, null, 2))
    return result
  }
  text()
  return result
}

async function resolveNarutoLocalWorkerMode(parsed: NarutoArgs) {
  const configInput: Parameters<typeof resolveOllamaWorkerConfig>[0] = {
    ollamaEnabled: parsed.ollamaEnabled,
    model: parsed.ollamaModel,
    baseUrl: parsed.ollamaBaseUrl
  }
  if (parsed.backend === 'ollama') configInput.backend = 'ollama'
  const config = await resolveOllamaWorkerConfig(configInput).catch(() => null)
  const policy = classifyOllamaWorkerSlice({
    id: 'naruto-local-worker-probe',
    role: parsed.readonly ? 'collector' : 'implementer',
    description: parsed.prompt,
    write_paths: parsed.readonly ? [] : ['<lease-scoped-worker-path>']
  }, { route: NARUTO_ROUTE, agent: { role: parsed.readonly ? 'collector' : 'implementer' } })
  const autoSelectEligible = parsed.backend === 'codex-sdk'
    && parsed.backendExplicit !== true
    && parsed.noOllama !== true
    && config?.ok === true
    && config.enabled === true
    && policy.ok === true
  return {
    schema: 'sks.naruto-local-worker-mode.v1',
    enabled: config?.enabled === true,
    provider: config?.provider || 'ollama',
    model: config?.model || null,
    requested_backend: parsed.backend,
    backend_explicit: parsed.backendExplicit,
    auto_select_eligible: autoSelectEligible,
    worker_only: true,
    no_strategy_planning_design: true,
    policy,
    blockers: [
      ...(config?.blockers || (config ? [] : ['ollama_worker_config_unavailable'])),
      ...(policy.blockers || []),
      ...(parsed.backendExplicit ? ['backend_explicit'] : []),
      ...(parsed.noOllama ? ['no_ollama_requested'] : [])
    ]
  }
}

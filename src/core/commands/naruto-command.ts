import path from 'node:path'
import { findLatestMission, loadMission } from '../mission.js'
import { readJson, sksRoot } from '../fsx.js'
import { runNativeAgentOrchestrator } from '../agents/agent-orchestrator.js'
import { buildNarutoCloneRoster, systemSafeNarutoConcurrency } from '../agents/agent-roster.js'
import { DEFAULT_NARUTO_CLONES, MAX_NARUTO_AGENT_COUNT } from '../agents/agent-schema.js'
import { attachZellijSessionInteractive, launchZellijLayout } from '../zellij/zellij-launcher.js'

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
  const roster = buildNarutoCloneRoster({
    clones: parsed.clones,
    prompt: parsed.prompt,
    readonly: parsed.readonly,
    maxAgentCount: MAX_NARUTO_AGENT_COUNT
  })
  // The clone roster is the full work fan-out; live concurrency is throttled to a
  // system-safe number so naruto never spawns the whole count at once.
  const safe = systemSafeNarutoConcurrency({ backend: parsed.backend })
  const activeSlots = Math.max(1, Math.min(roster.agent_count, safe.cap))
  const result = await runNativeAgentOrchestrator({
    prompt: parsed.prompt,
    route: NARUTO_ROUTE,
    routeCommand: 'sks naruto run',
    routeBlackboxKind: 'actual_naruto_command',
    roster,
    agents: roster.agent_count,
    concurrency: activeSlots,
    targetActiveSlots: activeSlots,
    desiredWorkItemCount: parsed.workItems,
    maxAgentCount: MAX_NARUTO_AGENT_COUNT,
    narutoMode: true,
    clones: roster.agent_count,
    backend: parsed.backend,
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
    proof: result.proof?.status || 'missing',
    run: result,
    zellij: null as any
  }
  if (!parsed.json && !parsed.mock && !parsed.noOpenZellij) {
    const ledgerRoot = result.ledger_root
      ? path.join(root, result.ledger_root)
      : path.join(root, '.sneakoscope', 'missions', result.mission_id, 'agents')
    summary.zellij = await launchZellijLayout({
      root,
      missionId: result.mission_id,
      ledgerRoot,
      kind: 'naruto',
      slotCount: summary.target_active_slots,
      dryRun: false,
      attach: false
    })
    if (summary.zellij?.ok && summary.zellij.capability?.status === 'ok' && parsed.attach) attachZellijSessionInteractive(summary.zellij.session_name, { cwd: process.cwd() })
  }
  return emit(parsed, summary, () => {
    console.log('🍥 Shadow Clone Jutsu — Kage Bunshin no Jutsu')
    console.log('Mission: ' + result.mission_id)
    console.log('Clones: ' + summary.clones + ' / max ' + MAX_NARUTO_AGENT_COUNT + ', running ' + summary.target_active_slots + ' at a time' + (summary.concurrency_capped ? ` (throttled to host capacity: ${safe.cores} cores, ${safe.free_gb} GB free)` : ''))
    console.log('Backend: ' + result.backend)
    console.log('Proof: ' + summary.proof)
    if (summary.zellij?.ok && summary.zellij.capability?.status === 'ok') console.log('Zellij: prepared ' + summary.target_active_slots + ' native session lane(s) in ' + summary.zellij.session_name)
    else if (summary.zellij?.ok) console.log('Zellij: optional live panes unavailable (' + ((summary.zellij.warnings || []).join('; ') || summary.zellij.capability?.status || 'unknown') + ')')
  })
}

async function narutoStatus(parsed: NarutoArgs) {
  const root = await sksRoot()
  const id = parsed.missionId && parsed.missionId !== 'latest' ? parsed.missionId : await findLatestMission(root)
  if (!id) return emit(parsed, { schema: NARUTO_RESULT_SCHEMA, ok: false, action: 'status', status: 'missing_mission' }, () => console.log('No Naruto mission found.'))
  const { dir } = await loadMission(root, id)
  const proof = await readJson<any>(path.join(dir, 'agents', 'agent-proof-evidence.json'), null)
  const scheduler = await readJson<any>(path.join(dir, 'agents', 'agent-scheduler-state.json'), null)
  const summary = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: proof !== null,
    action: 'status',
    mission_id: id,
    proof: proof?.status || 'missing',
    target_active_slots: scheduler?.target_active_slots ?? null,
    max_active_slots: scheduler?.max_active_slots ?? null,
    completed: scheduler?.completed_count ?? null
  }
  return emit(parsed, summary, () => {
    console.log('🍥 Naruto mission: ' + id)
    console.log('Proof: ' + summary.proof)
    if (summary.target_active_slots !== null) console.log('Active clones: ' + summary.target_active_slots + ' / max ' + summary.max_active_slots)
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
      'sks naruto run "<task>" [--clones N] [--backend codex-exec|fake] [--work-items N] [--real] [--readonly] [--json]',
      'sks naruto status [--mission <id>] [--json]'
    ],
    defaults: { clones: DEFAULT_NARUTO_CLONES, max_clones: MAX_NARUTO_AGENT_COUNT, backend: 'codex-exec' }
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
  backend: string
  mock: boolean
  real: boolean
  readonly: boolean
  writeMode: 'proof-safe' | 'parallel' | 'serial' | 'off' | null
  json: boolean
  missionId: string
  noOpenZellij: boolean
  attach: boolean
}

function parseNarutoArgs(args: string[] = []): NarutoArgs {
  const first = args[0] && !String(args[0]).startsWith('--') ? String(args[0]) : ''
  const actions = new Set(['run', 'status', 'help'])
  const action = (actions.has(first) ? first : 'run') as NarutoArgs['action']
  const rest = action === first ? args.slice(1) : args
  const json = hasFlag(args, '--json')
  const requestedClones = Number(readOption(args, '--clones', readOption(args, '--agents', DEFAULT_NARUTO_CLONES)))
  const clones = clampClones(requestedClones)
  const workItems = clampWorkItems(Number(readOption(args, '--work-items', clones)), clones)
  const backend = String(readOption(args, '--backend', hasFlag(args, '--mock') ? 'fake' : 'codex-exec'))
  const mock = hasFlag(args, '--mock') || backend === 'fake'
  const real = hasFlag(args, '--real')
  const readonly = hasFlag(args, '--readonly') || hasFlag(args, '--read-only')
  const writeModeRaw = String(readOption(args, '--write-mode', hasFlag(args, '--parallel-write') ? 'parallel' : '') || '')
  const writeMode = (['proof-safe', 'parallel', 'serial', 'off'].includes(writeModeRaw) ? writeModeRaw : null) as NarutoArgs['writeMode']
  const missionId = String(readOption(args, '--mission', readOption(args, '--mission-id', 'latest')))
  const noOpenZellij = hasFlag(args, '--no-open-zellij') || hasFlag(args, '--no-zellij')
  const attach = hasFlag(args, '--attach')
  const valueFlags = new Set(['--clones', '--agents', '--work-items', '--backend', '--write-mode', '--mission', '--mission-id'])
  const prompt = positionalArgs(rest, valueFlags).join(' ').trim() || 'Naruto shadow clone swarm run'
  return { action, prompt, clones, workItems, backend, mock, real, readonly, writeMode, json, missionId, noOpenZellij, attach }
}

function clampClones(value: number): number {
  if (!Number.isFinite(value) || value < 1) return DEFAULT_NARUTO_CLONES
  return Math.min(MAX_NARUTO_AGENT_COUNT, Math.floor(value))
}

function clampWorkItems(value: number, clones: number): number {
  if (!Number.isFinite(value) || value < 1) return clones
  return Math.floor(value)
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

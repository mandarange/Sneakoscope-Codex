import path from 'node:path'
import { ARTIFACT_FILES } from '../artifact-schemas.js'
import { appendJsonlBounded, nowIso, readJson, readText, sksRoot, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { loadMission } from '../mission.js'
import { MIN_TEAM_REVIEWER_LANES } from '../team-review-policy.js'
import { attachZellijSessionInteractive, launchTeamZellijView } from '../zellij/zellij-launcher.js'
import { flag, readFlagValue } from './command-utils.js'

const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json'
const TEAM_RUNTIME_TASKS_ARTIFACT = 'team-runtime-tasks.json'

export const teamLegacySubcommands = new Set([
  'log',
  'tail',
  'watch',
  'lane',
  'status',
  'dashboard',
  'event',
  'message',
  'open-zellij',
  'attach-zellij',
  'cleanup-zellij',
  'open-tmux',
  'attach-tmux',
  'cleanup-tmux'
])

export async function teamLegacyObserveCommand(sub: string, args: any[] = []) {
  const root = await sksRoot()
  const missionArg = args[0] && !String(args[0]).startsWith('--') ? args[0] : 'latest'
  const { resolveMissionId } = await import('./command-utils.js')
  const id = await resolveMissionId(root, missionArg)
  if (!id) {
    console.error(`Usage: sks team ${sub} [mission-id|latest]`)
    process.exitCode = 1
    return
  }
  const { dir } = await loadMission(root, id)
  if (sub === 'open-tmux' || sub === 'attach-tmux' || sub === 'cleanup-tmux') {
    const result = { ok: false, status: 'removed_runtime', runtime: 'tmux', replacement: 'zellij', operator_actions: ['Use `sks team open-zellij`, `attach-zellij`, or `cleanup-zellij`.'] }
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2))
    console.error('tmux runtime has been removed from SKS Team. Use Zellij commands instead.')
    process.exitCode = 2
    return
  }
  if (sub === 'open-zellij' || sub === 'attach-zellij') {
    const plan = await readJson(path.join(dir, 'team-plan.json'), null)
    if (!plan) {
      console.error(`Team plan missing for ${id}; cannot open Zellij Team view.`)
      process.exitCode = 2
      return
    }
    const slotCount = await inferTeamZellijSlotCount(dir, plan)
    const zellij = await launchTeamZellijView({ root, missionId: id, ledgerRoot: path.join(dir, 'agents'), slotCount, dryRun: flag(args, '--json'), attach: false })
    if (flag(args, '--json')) return console.log(JSON.stringify(zellij, null, 2))
    if (!zellij.ok) {
      console.error(`Zellij Team view blocked for ${id}: ${(zellij.blockers || []).join('; ') || 'Zellij launch failed'}`)
      process.exitCode = 2
      return
    }
    if (zellij.capability?.status === 'ok') console.log(`Zellij: prepared Team lane(s) in ${zellij.session_name}`)
    else console.log(`Zellij: optional live panes unavailable (${(zellij.warnings || []).join('; ') || zellij.capability?.status || 'unknown'})`)
    if (zellij.capability?.status === 'ok' && (sub === 'attach-zellij' || shouldAutoAttachTeamZellij(args))) {
      attachZellijSessionInteractive(zellij.session_name, { cwd: root, configPath: zellij.clipboard_config_path })
    }
    return
  }
  if (sub === 'event') {
    const message = readFlagValue(args, '--message', '')
    if (!message) {
      console.error('Usage: sks team event [mission-id|latest] --agent <name> --phase <phase> --message "..."')
      process.exitCode = 1
      return
    }
    const phase = readFlagValue(args, '--phase', 'general')
    const record = await appendTeamEvent(dir, { agent: readFlagValue(args, '--agent', 'parent_orchestrator'), phase, type: readFlagValue(args, '--type', 'status'), artifact: readFlagValue(args, '--artifact', ''), message })
    if (flag(args, '--json')) return console.log(JSON.stringify(record, null, 2))
    console.log(`${record.ts} [${record.phase}] ${record.agent}: ${record.message}`)
    return
  }
  if (sub === 'message') {
    const message = readFlagValue(args, '--message', '')
    if (!message) {
      console.error('Usage: sks team message [mission-id|latest] --from <agent> --to <agent|all> --message "..."')
      process.exitCode = 1
      return
    }
    const record = await appendTeamEvent(dir, { agent: readFlagValue(args, '--from', readFlagValue(args, '--agent', 'parent_orchestrator')), to: readFlagValue(args, '--to', 'all'), phase: readFlagValue(args, '--phase', 'communication'), type: 'message', message })
    if (flag(args, '--json')) return console.log(JSON.stringify(record, null, 2))
    console.log(`${record.ts} [${record.phase}] ${record.agent} -> ${record.to}: ${record.message}`)
    return
  }
  if (sub === 'cleanup-zellij') {
    const control = await requestTeamSessionCleanup(dir, { missionId: id, agent: readFlagValue(args, '--agent', 'parent_orchestrator'), reason: readFlagValue(args, '--reason', 'Team session ended; clean up live follow panes.'), finalMessage: 'Team session ended.' })
    await appendTeamEvent(dir, { agent: readFlagValue(args, '--agent', 'parent_orchestrator'), phase: 'session_cleanup', type: 'cleanup', message: control.cleanup_reason || 'Team session cleanup requested.' })
    const cleanup = { ok: true, runtime: 'zellij', mission_id: id, control, close_requested: flag(args, '--close-session') || flag(args, '--close') }
    await writeJsonAtomic(path.join(dir, 'zellij-session-cleanup.json'), cleanup)
    if (flag(args, '--json')) return console.log(JSON.stringify(cleanup, null, 2))
    console.log('Zellij cleanup: marked complete.')
    console.log(renderTeamCleanupSummary(control))
    return
  }
  if (sub === 'status') {
    const dashboard = await readTeamDashboard(dir)
    if (flag(args, '--json')) return console.log(JSON.stringify(dashboard || {}, null, 2))
    if (!dashboard) {
      console.error(`Team dashboard missing for ${id}.`)
      process.exitCode = 2
      return
    }
    console.log(`Team mission: ${id}`)
    console.log(`Updated: ${dashboard.updated_at || 'unknown'}`)
    console.log(`Agent sessions: ${dashboard.agent_session_count || MIN_TEAM_REVIEWER_LANES}`)
    if (dashboard.role_counts) console.log(`Role counts: ${formatRoleCounts(dashboard.role_counts)}`)
    return
  }
  if (sub === 'dashboard') {
    await writeTeamDashboardState(dir, { missionId: id })
    const state = await readJson(path.join(dir, ARTIFACT_FILES.team_dashboard_state), {})
    if (flag(args, '--json')) return console.log(JSON.stringify(state, null, 2))
    console.log(renderTeamDashboardState(state))
    return
  }
  if (sub === 'log') return console.log(await readTeamLive(dir))
  if (sub === 'lane') {
    const agent = readFlagValue(args, '--agent', 'parent_orchestrator')
    const phase = readFlagValue(args, '--phase', '')
    const lines = Number(readFlagValue(args, '--lines', '12'))
    const text = await renderTeamAgentLane(dir, { missionId: id, agent, phase, lines })
    if (flag(args, '--json')) return console.log(JSON.stringify({ mission_id: id, agent, phase, lane: text }, null, 2))
    console.log(text)
    if (flag(args, '--follow') && !teamCleanupRequested(await readTeamControl(dir)) && !isTerminalTeamAgentStatus((await readTeamDashboard(dir).catch(() => null))?.agents?.[agent]?.status || '')) {
      // Follow mode intentionally falls through only for interactive terminals in the full Zellij lane.
    }
    return
  }
  if (sub === 'tail' || sub === 'watch') {
    const lines = readFlagValue(args, '--lines', '20')
    if (sub === 'watch' && !flag(args, '--raw')) console.log(await renderTeamWatch(dir, { missionId: id, lines: Number(lines) }))
    else for (const line of await readTeamTranscriptTail(dir, Number(lines))) console.log(line)
  }
}

async function inferTeamZellijSlotCount(dir: string, plan: any = {}) {
  const scheduler = await readJson<any>(path.join(dir, 'agents', 'agent-scheduler-state.json'), null)
  const lanes = await readJson<any>(path.join(dir, 'agents', 'agent-zellij-lanes.json'), null)
  const candidates = [
    plan?.bundle_size,
    plan?.agent_session_count,
    lanes?.lane_count,
    plan?.target_active_slots,
    scheduler?.target_active_slots
  ].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
  return Math.max(1, Math.min(100, Math.floor(candidates[0] || 5)))
}

function shouldAutoAttachTeamZellij(args: any[] = []) {
  const list = (args || []).map((arg: any) => String(arg))
  if (list.includes('--no-attach')) return false
  if (list.includes('--json')) return false
  if (process.env.SKS_NO_ZELLIJ_ATTACH === '1') return false
  if (process.env.ZELLIJ) return false
  if (list.includes('--attach')) return true
  return Boolean(process.stdout.isTTY && process.stdin.isTTY)
}

function teamLogPaths(dir: string) {
  return {
    live: path.join(dir, 'team-live.md'),
    transcript: path.join(dir, 'team-transcript.jsonl'),
    dashboard: path.join(dir, 'team-dashboard.json'),
    control: path.join(dir, 'team-control.json')
  }
}

function defaultTeamControl(id: string) {
  return {
    schema_version: 1,
    mission_id: id,
    status: 'running',
    cleanup_requested: false,
    cleanup_requested_at: null,
    cleanup_requested_by: null,
    cleanup_reason: null,
    final_message: null
  }
}

function formatRoleCounts(roleCounts: any = {}) {
  return Object.entries(roleCounts || {}).map(([role, count]) => `${role}:${count}`).join(' ')
}

async function readTeamDashboard(dir: string) {
  return readJson<any>(teamLogPaths(dir).dashboard, null)
}

async function readTeamLive(dir: string) {
  return readText(teamLogPaths(dir).live, '')
}

async function readTeamTranscriptTail(dir: string, count: any = 20) {
  const text = await readText(teamLogPaths(dir).transcript, '')
  return text.split(/\n/).filter(Boolean).slice(-Math.max(1, Number(count) || 20))
}

async function readTeamControl(dir: string) {
  const control = await readJson<any>(teamLogPaths(dir).control, defaultTeamControl(path.basename(dir)))
  const cleanup = await readJson<any>(path.join(dir, TEAM_SESSION_CLEANUP_ARTIFACT), null).catch(() => null)
  if (!cleanup || (cleanup.passed !== true && cleanup.live_transcript_finalized !== true && cleanup.all_sessions_closed !== true)) return control
  return {
    ...defaultTeamControl(path.basename(dir)),
    ...control,
    status: 'ended',
    cleanup_requested: true,
    cleanup_requested_at: cleanup.updated_at || cleanup.completed_at || cleanup.closed_at || control.cleanup_requested_at || 'artifact',
    cleanup_requested_by: cleanup.agent || control.cleanup_requested_by || 'parent_orchestrator',
    cleanup_reason: cleanup.reason || control.cleanup_reason || `${TEAM_SESSION_CLEANUP_ARTIFACT} passed.`,
    final_message: cleanup.final_message || control.final_message || 'Team session ended. Legacy observation lanes can stop.'
  }
}

async function appendTeamEvent(dir: string, event: any) {
  const files = teamLogPaths(dir)
  const record = {
    ts: event.ts || nowIso(),
    agent: String(event.agent || 'parent_orchestrator'),
    phase: String(event.phase || 'general'),
    type: String(event.type || 'status'),
    to: event.to ? String(event.to).slice(0, 200) : undefined,
    message: String(event.message || '').slice(0, 4000),
    artifact: event.artifact ? String(event.artifact) : undefined
  }
  await appendJsonlBounded(files.transcript, record, 1024 * 1024)
  const dashboard = await readJson<any>(files.dashboard, null)
  if (dashboard) {
    dashboard.updated_at = record.ts
    dashboard.latest_messages = [...(dashboard.latest_messages || []), record].slice(-20)
    dashboard.agents ||= {}
    dashboard.agents[record.agent] ||= {}
    dashboard.agents[record.agent].status = isTerminalTeamAgentStatus(record.type) ? record.type : record.type || 'active'
    dashboard.agents[record.agent].phase = record.phase
    dashboard.agents[record.agent].last_seen = record.ts
    await writeJsonAtomic(files.dashboard, dashboard)
  }
  const target = record.to ? ` -> ${record.to}` : ''
  const current = await readText(files.live, '# SKS Team Live Transcript\n\n## Live Events\n')
  const line = `\n- ${record.ts} [${record.phase}] ${record.agent}${target}: ${record.message}${record.artifact ? ` (${record.artifact})` : ''}\n`
  await writeTextAtomic(files.live, `${current.trimEnd()}${line}`)
  return record
}

async function requestTeamSessionCleanup(dir: string, opts: any = {}) {
  const current = await readTeamControl(dir)
  const next = {
    ...defaultTeamControl(current?.mission_id || opts.missionId || path.basename(dir)),
    ...current,
    status: 'cleanup_requested',
    cleanup_requested: true,
    cleanup_requested_at: opts.ts || nowIso(),
    cleanup_requested_by: opts.agent || 'parent_orchestrator',
    cleanup_reason: opts.reason || 'Team session cleanup requested.',
    final_message: opts.finalMessage || 'Team session ended.'
  }
  await writeJsonAtomic(teamLogPaths(dir).control, next)
  return next
}

function teamCleanupRequested(control: any = {}) {
  return Boolean(control?.cleanup_requested || control?.status === 'cleanup_requested' || control?.status === 'ended')
}

function isTerminalTeamAgentStatus(status: any = '') {
  return /(?:^|_)(?:done|complete|completed|closed|cleanup|cancelled|canceled|failed|ended|stopped)(?:_|$)/i.test(String(status || ''))
}

function renderTeamCleanupSummary(control: any = {}) {
  if (!teamCleanupRequested(control)) return ''
  return [
    '# SKS Team Session Cleanup',
    '',
    `Status: ${control.status || 'cleanup_requested'}`,
    `Requested at: ${control.cleanup_requested_at || 'unknown'}`,
    `Requested by: ${control.cleanup_requested_by || 'unknown'}`,
    `Reason: ${control.cleanup_reason || 'Team session cleanup requested.'}`,
    '',
    control.final_message || 'Team session ended.'
  ].join('\n')
}

async function renderTeamAgentLane(dir: string, opts: any = {}) {
  const agent = String(opts.agent || opts.agentId || 'parent_orchestrator')
  const lines = Math.max(1, Number(opts.lines) || 12)
  const dashboard = await readTeamDashboard(dir)
  const control = await readTeamControl(dir)
  const runtime = await readJson<any>(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), null)
  const status = dashboard?.agents?.[agent] || {}
  const tasks = (Array.isArray(runtime?.tasks) ? runtime.tasks : []).filter((task: any) => task?.worker === agent || task?.agent_hint === agent)
  const events = (await readTeamTranscriptTail(dir, lines)).map(parseTranscriptLine).filter((event: any) => event.raw || event.agent === agent || event.to === agent || event.to === 'all')
  return [
    '# SKS Team Agent Lane',
    '',
    `Mission: ${opts.missionId || dashboard?.mission_id || runtime?.mission_id || path.basename(dir)}`,
    `Agent: ${agent}`,
    teamCleanupRequested(control) ? `Cleanup: requested at ${control.cleanup_requested_at || 'unknown'}` : null,
    '',
    '## Agent Status',
    `- status: ${status.status || 'pending'}`,
    `- phase: ${status.phase || 'unknown'}`,
    `- last_seen: ${status.last_seen || 'never'}`,
    '',
    '## Assigned Runtime Tasks',
    ...formatRuntimeTasks(tasks),
    '',
    '## Recent Events',
    ...(events.length ? events.map(formatTranscriptEvent) : ['- No matching events yet.']),
    teamCleanupRequested(control) ? ['', renderTeamCleanupSummary(control)].join('\n') : null
  ].filter((line) => line !== null).join('\n')
}

async function renderTeamWatch(dir: string, opts: any = {}) {
  const lines = Math.max(1, Number(opts.lines) || 20)
  const dashboard = await readTeamDashboard(dir)
  const control = await readTeamControl(dir)
  const runtime = await readJson<any>(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), null)
  const events = (await readTeamTranscriptTail(dir, lines)).map(parseTranscriptLine)
  const agents = Object.entries(dashboard?.agents || {}).slice(0, Math.max(3, Number(dashboard?.agent_session_count) || 3))
  return [
    '# SKS Team Legacy Observation',
    '',
    `Mission: ${opts.missionId || dashboard?.mission_id || runtime?.mission_id || path.basename(dir)}`,
    `Updated: ${dashboard?.updated_at || 'unknown'}`,
    `Agent session budget: ${dashboard?.agent_session_count || 'unknown'}`,
    dashboard?.role_counts ? `Role counts: ${formatRoleCounts(dashboard.role_counts)}` : null,
    teamCleanupRequested(control) ? `Cleanup: requested at ${control.cleanup_requested_at || 'unknown'}` : null,
    '',
    '## Visible Agent Lanes',
    ...(agents.length ? agents.map(([name, status]: any) => `- ${name}: ${status.status || 'pending'} | ${status.phase || 'unknown'} | last_seen:${status.last_seen || 'never'}`) : ['- No agent lanes registered yet.']),
    '',
    '## Runtime Task Snapshot',
    ...formatRuntimeTasks((Array.isArray(runtime?.tasks) ? runtime.tasks : []).slice(0, 8)),
    '',
    '## Recent Mission Events',
    ...(events.length ? events.map(formatTranscriptEvent) : ['- No transcript events yet.']),
    teamCleanupRequested(control) ? ['', renderTeamCleanupSummary(control)].join('\n') : null
  ].filter((line) => line !== null).join('\n')
}

async function writeTeamDashboardState(dir: string, opts: any = {}) {
  const mission = await readJson<any>(path.join(dir, 'mission.json'), {})
  const dashboard = await readTeamDashboard(dir) || {}
  const runtime = await readJson<any>(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), {})
  const gate = await readJson<any>(path.join(dir, 'team-gate.json'), {})
  const state = {
    schema_version: 1,
    updated_at: nowIso(),
    mission: { id: mission.id || dashboard.mission_id || opts.missionId || 'unknown', route: mission.mode || 'team', phase: opts.phase || 'legacy_observe' },
    gates: Object.entries(gate || {}).filter(([, value]) => typeof value === 'boolean').map(([name, value]) => ({ name, status: value ? 'pass' : 'fail', evidence: [] })),
    agents: Object.entries(dashboard.agents || {}).map(([id, value]: any) => ({ id, role: value.role || null, status: value.status || 'pending', current_task: value.phase || null })),
    tasks: (runtime.tasks || []).map((task: any) => ({ id: task.task_id, deps: task.depends_on || [], status: task.status || 'pending' })),
    artifacts: ['team-plan.json', 'team-gate.json', 'team-live.md', 'team-dashboard.json', TEAM_RUNTIME_TASKS_ARTIFACT]
  }
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.team_dashboard_state), state)
  return { ok: true, state }
}

function renderTeamDashboardState(state: any = {}) {
  return [
    `Mission: ${state.mission?.id || 'unknown'} (${state.mission?.route || 'team'})`,
    `Phase: ${state.mission?.phase || 'unknown'}`,
    '',
    ...(state.gates || []).map((gate: any) => `[${gate.name}] ${gate.status}`),
    ...(state.agents?.length ? [`Agents: ${state.agents.length}`] : []),
    ...(state.tasks?.length ? [`Tasks: ${state.tasks.length}`] : [])
  ].join('\n')
}

function parseTranscriptLine(line: any) {
  try {
    return JSON.parse(line)
  } catch {
    return { raw: String(line || '').slice(0, 1000) }
  }
}

function formatTranscriptEvent(event: any = {}) {
  if (event.raw) return `- ${event.raw}`
  const parts = [event.ts || 'no-ts', `[${event.phase || 'general'}]`, event.agent || 'unknown', event.to ? `-> ${event.to}` : null, event.type ? `(${event.type})` : null].filter(Boolean)
  return `- ${parts.join(' ')}: ${String(event.message || '').slice(0, 500)}${event.artifact ? ` (${event.artifact})` : ''}`
}

function formatRuntimeTasks(tasks: any[] = []) {
  if (!tasks.length) return ['- No assigned runtime tasks found.']
  return tasks.slice(0, 12).map((task: any) => {
    const details = [task.status || 'pending', task.phase || task.role || 'team', task.depends_on?.length ? `deps:${task.depends_on.join(',')}` : null, task.file_paths?.length ? `files:${task.file_paths.slice(0, 3).join(',')}` : null].filter(Boolean).join(' | ')
    return `- ${task.task_id || 'task'} ${task.subject || task.symbolic_id || 'untitled'} (${details})`
  })
}

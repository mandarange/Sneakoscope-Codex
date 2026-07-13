import path from 'node:path'
import { readJson, readText, sksRoot } from '../fsx.js'
import { loadMission } from '../mission.js'
import { MIN_TEAM_REVIEWER_LANES } from '../team-review-policy.js'
import { flag, readFlagValue } from './command-utils.js'

const READ_ONLY_TEAM_SUBCOMMANDS = new Set(['log', 'tail', 'watch', 'lane', 'status'])
const REMOVED_TEAM_SUBCOMMANDS = new Set([
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

export const teamLegacySubcommands = new Set([...READ_ONLY_TEAM_SUBCOMMANDS, ...REMOVED_TEAM_SUBCOMMANDS])

export async function teamLegacyObserveCommand(sub: string, args: any[] = []) {
  if (!READ_ONLY_TEAM_SUBCOMMANDS.has(sub)) return removedTeamSurface(sub, args)
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
  if (sub === 'status') return renderStatus(id, dir, args)
  if (sub === 'log') return console.log(await readText(path.join(dir, 'team-live.md'), ''))
  if (sub === 'lane') return renderLane(id, dir, args)
  return renderTailOrWatch(sub, id, dir, args)
}

function removedTeamSurface(sub: string, args: any[]) {
  const result = {
    schema: 'sks.team-legacy-observe.v1',
    ok: false,
    status: 'removed_non_read_only_surface',
    subcommand: sub,
    read_only_commands: [...READ_ONLY_TEAM_SUBCOMMANDS],
    replacement: 'Use sks naruto status|subagents|proof for current official-subagent missions.'
  }
  process.exitCode = 2
  if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2))
  else console.error(`sks team ${sub} was removed because legacy Team commands are read-only. ${result.replacement}`)
  return result
}

async function renderStatus(id: string, dir: string, args: any[]) {
  const dashboard = await readJson<any>(path.join(dir, 'team-dashboard.json'), null)
  if (!dashboard) {
    const result = { schema: 'sks.team-legacy-observe.v1', ok: false, status: 'dashboard_missing', mission_id: id }
    process.exitCode = 2
    if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2))
    else console.error(`Team dashboard missing for ${id}.`)
    return result
  }
  const result = {
    schema: 'sks.team-legacy-observe.v1',
    ok: true,
    status: 'read_only',
    mission_id: id,
    updated_at: dashboard.updated_at || null,
    agent_session_count: dashboard.agent_session_count || MIN_TEAM_REVIEWER_LANES,
    role_counts: dashboard.role_counts || null
  }
  if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`Team mission: ${id}`)
    console.log(`Updated: ${result.updated_at || 'unknown'}`)
    console.log(`Agent sessions: ${result.agent_session_count}`)
  }
  return result
}

async function renderLane(id: string, dir: string, args: any[]) {
  const agent = readFlagValue(args, '--agent', 'parent_orchestrator')
  const lines = Math.max(1, Number(readFlagValue(args, '--lines', '12')) || 12)
  const [dashboard, runtime, events] = await Promise.all([
    readJson<any>(path.join(dir, 'team-dashboard.json'), {}),
    readJson<any>(path.join(dir, 'team-runtime-tasks.json'), {}),
    transcriptTail(dir, lines)
  ])
  const status = dashboard?.agents?.[agent] || {}
  const tasks = (Array.isArray(runtime?.tasks) ? runtime.tasks : []).filter((task: any) => task?.worker === agent || task?.agent_hint === agent)
  const result = {
    schema: 'sks.team-legacy-observe.v1',
    ok: true,
    status: 'read_only',
    mission_id: id,
    agent,
    agent_status: status,
    tasks,
    events
  }
  if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`# SKS Team Agent Lane\n\nMission: ${id}\nAgent: ${agent}`)
    console.log(`Status: ${status.status || 'pending'} | phase: ${status.phase || 'unknown'}`)
    for (const task of tasks.slice(0, 12)) console.log(`- ${task.task_id || 'task'}: ${task.subject || task.symbolic_id || 'untitled'} (${task.status || 'pending'})`)
    for (const event of events) console.log(event)
  }
  return result
}

async function renderTailOrWatch(sub: string, id: string, dir: string, args: any[]) {
  const lines = Math.max(1, Number(readFlagValue(args, '--lines', '20')) || 20)
  const events = await transcriptTail(dir, lines)
  const result = { schema: 'sks.team-legacy-observe.v1', ok: true, status: 'read_only', action: sub, mission_id: id, events }
  if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2))
  else {
    if (sub === 'watch' && !flag(args, '--raw')) console.log(`# SKS Team Legacy Observation\n\nMission: ${id}`)
    for (const event of events) console.log(event)
  }
  return result
}

async function transcriptTail(dir: string, count: number) {
  const text = await readText(path.join(dir, 'team-transcript.jsonl'), '')
  return text.split(/\n/).filter(Boolean).slice(-count)
}

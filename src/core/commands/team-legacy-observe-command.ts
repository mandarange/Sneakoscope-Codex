import path from 'node:path'
import { ARTIFACT_FILES } from '../artifact-schemas.js'
import { readJson, sksRoot, writeJsonAtomic } from '../fsx.js'
import { loadMission } from '../mission.js'
import { MIN_TEAM_REVIEWER_LANES } from '../team-review-policy.js'
import { renderTeamDashboardState, writeTeamDashboardState } from '../team-dashboard-renderer.js'
import {
  appendTeamEvent,
  formatRoleCounts,
  isTerminalTeamAgentStatus,
  readTeamControl,
  readTeamDashboard,
  readTeamLive,
  readTeamTranscriptTail,
  renderTeamAgentLane,
  renderTeamCleanupSummary,
  renderTeamWatch,
  requestTeamSessionCleanup,
  teamCleanupRequested
} from '../team-live.js'
import { attachZellijSessionInteractive, launchTeamZellijView } from '../zellij/zellij-launcher.js'
import { flag, readFlagValue } from './command-utils.js'

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

import path from 'node:path'
import { findLatestMission, loadMission } from '../mission.js'
import { readJson, readText, sksRoot } from '../fsx.js'
import { runNativeAgentOrchestrator } from '../agents/agent-orchestrator.js'
import { parseAgentCommandArgs } from '../agents/agent-command-surface.js'
import { buildAgentRoster } from '../agents/agent-roster.js'
import { buildAgentWorkPartition } from '../agents/agent-work-partition.js'
import { runAgentCleanupExecutor } from '../agents/agent-cleanup-executor.js'

const AGENT_ACTION_SCHEMA = 'sks.agent-command-result.v1'

export async function agentCommand(commandOrArgs: string | string[] = 'agent', maybeArgs: string[] = []) {
  const args = Array.isArray(commandOrArgs) ? commandOrArgs : maybeArgs
  const parsed = parseAgentCommandArgs('agent', args)
  if (parsed.action === 'run' || parsed.action === 'spawn') return agentRun(parsed)
  if (parsed.action === 'plan') return agentPlan(parsed)
  return agentMissionAction(parsed)
}

async function agentRun(parsed: any) {
  const result = await runNativeAgentOrchestrator({ ...parsed, routeCommand: 'sks agent run', routeBlackboxKind: 'actual_agent_command' })
  return emit(parsed, result, () => {
    console.log('Native agent mission: ' + result.mission_id)
    console.log('Backend: ' + result.backend)
    console.log('Agents: ' + result.roster.agent_count + ' (concurrency ' + result.roster.concurrency + ')')
    console.log('Proof: ' + result.proof.status)
  })
}

async function agentPlan(parsed: any) {
  const root = await sksRoot()
  const roster = buildAgentRoster({ agents: parsed.agents, concurrency: parsed.concurrency, prompt: parsed.prompt, readonly: parsed.readonly })
  const partition = await buildAgentWorkPartition(root, roster, parsed.prompt, {
    route: parsed.route,
    targetActiveSlots: parsed.targetActiveSlots,
    desiredWorkItemCount: parsed.desiredWorkItemCount,
    minimumWorkItems: parsed.minimumWorkItems
  })
  const result = { schema: 'sks.agent-plan.v1', ok: partition.ok, prompt: parsed.prompt, route: parsed.route, backend: parsed.backend, roster, task_graph: partition.task_graph?.route_work_count_summary, partition: { slice_count: partition.slices.length, lease_count: partition.leases.length, blockers: partition.blockers, no_overlap_proof: partition.no_overlap_proof } }
  return emit(parsed, result, () => {
    console.log('Native agent plan')
    console.log('Agents: ' + roster.agent_count + ' (concurrency ' + roster.concurrency + ')')
    console.log('Target active slots: ' + (partition.task_graph?.target_active_slots || roster.agent_count))
    console.log('Work items: ' + (partition.task_graph?.total_work_items || partition.slices.length))
    console.log('Slices: ' + partition.slices.length + ', leases: ' + partition.leases.length)
    if (partition.blockers.length) console.log('Blockers: ' + partition.blockers.join(', '))
  })
}

async function agentMissionAction(parsed: any) {
  const root = await sksRoot()
  const id = await resolveAgentMission(root, parsed.missionId)
  if (!id) return emit(parsed, { schema: AGENT_ACTION_SCHEMA, ok: false, action: parsed.action, status: 'missing_mission' }, () => console.log('No mission found.'))
  const { dir } = await loadMission(root, id)
  const agentRoot = path.join(dir, 'agents')
  const readers: Record<string, string> = {
    status: 'agent-proof-evidence.json',
    watch: parsed.codexApp ? 'agent-codex-dashboard.md' : 'agent-events.jsonl',
    dashboard: 'agent-codex-dashboard.json',
    cockpit: 'agent-codex-dashboard.md',
    lane: parsed.lane ? path.join('sessions', parsed.lane + '.json') : 'agent-sessions.json',
    board: 'agent-task-board.json',
    ledger: 'agent-central-ledger.json',
    collect: 'agent-output-validation.json',
    consensus: 'agent-consensus.json',
    close: 'agent-cleanup-proof.json',
    cleanup: 'agent-cleanup-proof.json',
    proof: 'agent-proof-evidence.json',
    explain: 'agent-trust-report.json'
  }
  const artifact = readers[parsed.action] || 'agent-proof-evidence.json'
  if (parsed.action === 'close' || parsed.action === 'cleanup') {
    await runAgentCleanupExecutor({
      missionDir: dir,
      missionId: id,
      action: parsed.action,
      apply: parsed.apply === true,
      dryRun: parsed.dryRun === true,
      drain: parsed.drain === true,
      staleMs: parsed.staleMs,
      graceMs: parsed.graceMs,
      killEscalation: parsed.killEscalation
    })
  }
  const full = path.join(agentRoot, artifact)
  const value = artifact.endsWith('.json') ? await readJson(full, null) : await readText(full, '')
  const result = { schema: AGENT_ACTION_SCHEMA, ok: value !== null && value !== '', action: parsed.action, mission_id: id, artifact: path.join('agents', artifact), data: value }
  return emit(parsed, result, () => {
    console.log('Native agent mission: ' + id)
    console.log('Action: ' + parsed.action)
    console.log('Artifact: agents/' + artifact)
    if (artifact.endsWith('.md') || artifact.endsWith('.jsonl')) {
      console.log('')
      console.log(String(value || ''))
      return
    }
    if (parsed.action === 'proof' || parsed.action === 'status') console.log('Proof: ' + (value?.status || 'missing'))
    if (parsed.action === 'dashboard') {
      console.log('Proof: ' + (value?.proof_status || 'missing'))
      console.log('Agents: ' + (value?.agent_count ?? 'unknown'))
    }
    if (parsed.action === 'close' || parsed.action === 'cleanup') {
      console.log('Actions: ' + (value?.action_count ?? 0))
      console.log('Applied: ' + (value?.applied_count ?? 0))
      if (Array.isArray(value?.skipped_active_sessions) && value.skipped_active_sessions.length) console.log('Skipped active: ' + value.skipped_active_sessions.length)
      if (Array.isArray(value?.skipped_foreign_namespace) && value.skipped_foreign_namespace.length) console.log('Skipped foreign namespace: ' + value.skipped_foreign_namespace.length)
      if (Array.isArray(value?.blockers) && value.blockers.length) console.log('Blockers: ' + value.blockers.join(', '))
    }
  })
}

async function resolveAgentMission(root: string, requested: string) {
  if (requested && requested !== 'latest') return requested
  return findLatestMission(root)
}

function emit(parsed: any, result: any, text: () => void) {
  if (parsed.json) return console.log(JSON.stringify(result, null, 2))
  text()
}

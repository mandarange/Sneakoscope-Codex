import path from 'node:path'
import { findLatestMission, loadMission, missionDir } from '../mission.js'
import { readJson, readText, sksRoot, writeJsonAtomic } from '../fsx.js'
import { runNativeAgentOrchestrator } from '../agents/agent-orchestrator.js'
import { parseAgentCommandArgs } from '../agents/agent-command-surface.js'
import { buildAgentRoster } from '../agents/agent-roster.js'
import { buildAgentWorkPartition } from '../agents/agent-work-partition.js'
import { runAgentCleanupExecutor } from '../agents/agent-cleanup-executor.js'
import { rollbackAgentPatchApply } from '../agents/agent-patch-apply-worker.js'
import { PersistentAgentPatchQueueStore } from '../agents/agent-patch-queue-store.js'
import { runNativeCliWorkerFromArgs } from '../agents/native-cli-worker.js'

const AGENT_ACTION_SCHEMA = 'sks.agent-command-result.v1'

export async function agentCommand(commandOrArgs: string | string[] = 'agent', maybeArgs: string[] = []) {
  const args = Array.isArray(commandOrArgs) ? commandOrArgs : maybeArgs
  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') return agentHelp(args.includes('--json'))
  const parsed = parseAgentCommandArgs('agent', args)
  if (parsed.action === 'worker') return runNativeCliWorkerFromArgs(args.slice(args[0] === 'worker' ? 1 : 0))
  if (parsed.action === 'run' || parsed.action === 'spawn') return agentRun(parsed)
  if (parsed.action === 'plan') return agentPlan(parsed)
  return agentMissionAction(parsed)
}

function agentHelp(json = false) {
  const result = {
    schema: 'sks.agent-help.v1',
    ok: true,
    action: 'help',
    read_only: true,
    usage: 'sks agent run <prompt> [--mission <id>] [--agents <n>] [--concurrency <n>] [--readonly] [--json]',
    actions: ['run', 'plan', 'status', 'watch', 'dashboard', 'cockpit', 'lane', 'board', 'ledger', 'collect', 'consensus', 'close', 'cleanup', 'proof', 'explain', 'rollback-patches']
  }
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(result.usage)
    console.log('Actions: ' + result.actions.join(', '))
  }
  return result
}

async function agentRun(parsed: any) {
  if (normalizeRouteName(parsed.route) === 'release-review' && parsed.legacyNativeRuntime !== true) {
    const result = {
      schema: AGENT_ACTION_SCHEMA,
      ok: false,
      status: 'blocked',
      route: '$Release-Review',
      blocker: 'release_review_official_subagents_required',
      blockers: ['release_review_official_subagents_required'],
      next_command: `sks naruto run "$Release-Review ${String(parsed.prompt || 'release audit').replace(/"/g, '\\"')}" --agents ${Math.max(1, Number(parsed.agents || 1))} --read-only --json`,
      legacy_escape_hatch: 'Pass --legacy-native-runtime only for an explicitly approved legacy compatibility run.'
    }
    process.exitCode = 2
    return emit(parsed, result, () => {
      console.error('Release Review is owned by the Codex official subagent workflow. Use the suggested sks naruto command.')
    })
  }
  const result = await runNativeAgentOrchestrator({ ...parsed, routeCommand: 'sks agent run', routeBlackboxKind: 'actual_agent_command' })
  if (normalizeRouteName(parsed.route) === 'release-review' && result.mission_id) {
    await writeReleaseReviewNativeAgentPlan(parsed, result)
  }
  return emit(parsed, result, () => {
    console.log('Native agent mission: ' + result.mission_id)
    console.log('Backend: ' + result.backend)
    console.log('Agents: ' + result.roster.agent_count + ' (concurrency ' + result.roster.concurrency + ')')
    console.log('Proof: ' + result.proof.status)
  })
}

function normalizeRouteName(route: any = ''): string {
  return String(route || '').replace(/^\$/, '').trim().toLowerCase()
}

/**
 * Legacy compatibility fixtures may explicitly opt into the historical native
 * Release-Review runner with --legacy-native-runtime. Public $Release-Review
 * execution is owned by the official Codex subagent workflow.
 */
async function writeReleaseReviewNativeAgentPlan(parsed: any, result: any) {
  const root = await sksRoot()
  const dir = missionDir(root, result.mission_id)
  const plan = {
    schema: 'sks.release-review-native-agent-plan.v1',
    ok: Boolean(result.ok),
    mission_id: result.mission_id,
    route: '$Release-Review',
    route_command: 'sks agent run',
    backend: result.backend,
    prompt: parsed.prompt,
    roster: {
      agent_count: result.roster?.agent_count ?? parsed.agents ?? null,
      concurrency: result.roster?.concurrency ?? parsed.concurrency ?? null
    },
    proof_status: result.proof?.status || null,
    agent_proof_evidence: 'agents/agent-proof-evidence.json',
    agent_effort_policy: 'agents/agent-effort-policy.json'
  }
  await writeJsonAtomic(path.join(dir, 'release-review-native-agent-plan.json'), plan)
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
    explain: 'agent-trust-report.json',
    'rollback-patches': 'agent-patch-rollback-command-result.json'
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
  if (parsed.action === 'rollback-patches') {
    await runAgentPatchRollbackCommand(root, agentRoot, parsed)
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

async function runAgentPatchRollbackCommand(projectRoot: string, agentRoot: string, parsed: any) {
  const applyResults = await readJson<any>(path.join(agentRoot, 'agent-patch-apply-results.json'), null)
  const allRows = Array.isArray(applyResults?.results) ? applyResults.results : []
  const rows = parsed.patchEntryId ? allRows.filter((row: any) => String(row.entry_id || '') === parsed.patchEntryId) : allRows
  const results = []
  for (const row of rows) {
    const rollbackResult = {
      patch_entry_id: row.entry_id || null,
      ...(await rollbackAgentPatchApply(projectRoot, row, { dryRun: parsed.apply !== true }))
    }
    results.push(rollbackResult)
    if (parsed.apply === true && rollbackResult.ok === true && row.entry_id) {
      const store = await PersistentAgentPatchQueueStore.load(agentRoot)
      await store.markRolledBack(String(row.entry_id))
      await store.persistSnapshot()
    }
  }
  const failures = results.filter((row: any) => row.ok !== true)
  if (failures.length > 0) {
    await writeJsonAtomic(path.join(agentRoot, 'agent-patch-rollback-wrongness.json'), {
      schema: 'sks.agent-patch-rollback-wrongness.v1',
      ok: false,
      generated_at: new Date().toISOString(),
      failures,
      next_action: 'Inspect hash precondition failures before using --apply.'
    })
  }
  const blockers = [
    ...(allRows.length === 0 ? ['missing_apply_results'] : []),
    ...(allRows.length > 0 && rows.length === 0 ? ['no_matching_patch_entry'] : []),
    ...failures.flatMap((row: any) => row.violations || ['rollback_failed'])
  ].map(String)
  const commandResult = {
    schema: 'sks.agent-patch-rollback-command-result.v1',
    ok: rows.length > 0 && results.every((row: any) => row.ok === true),
    dry_run: parsed.apply !== true,
    apply: parsed.apply === true,
    mission_target: parsed.missionId || 'latest',
    patch_entry_id: parsed.patchEntryId || null,
    restored_files: [...new Set(results.flatMap((row: any) => row.restored_files || []))],
    deleted_files: [...new Set(results.flatMap((row: any) => row.deleted_files || []))],
    result_count: results.length,
    results,
    blockers,
    wrongness: failures.length ? 'agent-patch-rollback-wrongness.json' : null
  }
  if (!commandResult.ok) process.exitCode = 1
  await writeJsonAtomic(path.join(agentRoot, 'agent-patch-rollback-command-result.json'), commandResult)
}

async function resolveAgentMission(root: string, requested: string) {
  if (requested && requested !== 'latest') return requested
  return findLatestMission(root)
}

function emit(parsed: any, result: any, text: () => void) {
  if (parsed.json) return console.log(JSON.stringify(result, null, 2))
  text()
}

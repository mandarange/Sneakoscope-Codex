import path from 'node:path'
import { AGENT_PROOF_EVIDENCE_SCHEMA } from './agent-schema.js'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { validateAgentLedgerHashChain } from './agent-central-ledger.js'
import { assertAllAgentSessionsClosed } from './agent-lifecycle.js'
import { assertAgentTerminalSessionsClosed } from './agent-terminal-session.js'
import { assertAgentSessionGenerationsClosed } from './agent-session-generation.js'
import { readTmuxLaneSupervisor } from './tmux-lane-supervisor.js'

export async function writeAgentProofEvidence(root: string, input: { missionId: string; backend: string; route?: string; routeCommand?: string; routeBlackboxKind?: string; requestedWorkItems?: number; minimumWorkItems?: number; targetActiveSlots?: number; realParallel?: boolean; roster?: any; partition?: any; consensus?: any; results?: any[]; cleanup?: any; janitor?: any; trust?: any; wrongness?: any; outputTails?: any; timeoutKill?: any; scheduler?: any }) {
  const lifecycle = await assertAllAgentSessionsClosed(root)
  const terminal = await assertAgentTerminalSessionsClosed(root)
  const generations = await assertAgentSessionGenerationsClosed(root)
  const ledger = await validateAgentLedgerHashChain(root)
  const tmuxLanes = await readJson<any>(path.join(root, 'agent-tmux-lanes.json'), null)
  const laneSupervisor = await readTmuxLaneSupervisor(root)
  const workQueue = await readJson<any>(path.join(root, 'agent-work-queue.json'), null)
  const scheduler = input.scheduler || await readJson<any>(path.join(root, 'agent-scheduler-state.json'), null)
  const taskGraph = input.partition?.task_graph || await readJson<any>(path.join(root, 'agent-task-graph.json'), null)
  const slots = await readJson<any>(path.join(root, 'agent-worker-slots.json'), null)
  const generationArtifact = await readJson<any>(path.join(root, 'agent-session-generations.json'), null)
  const schedulerEvents = await readTextSafe(path.join(root, 'agent-scheduler-events.jsonl'))
  const tmuxLaunchLedger = await readTextSafe(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'))
  const tmuxPaneLaunchCount = tmuxLaunchLedger.split(/\n/).filter(Boolean).length
  const terminalCloseReportCount = terminal.total_sessions || 0
  const generationCount = generations.generation_count || 0
  const finalWorkItemCount = Number(scheduler?.completed_count || 0) + Number(scheduler?.failed_count || 0) + Number(scheduler?.blocked_count || 0)
  const requestedWorkItems = Number(input.requestedWorkItems || taskGraph?.desired_work_items || taskGraph?.total_work_items || 0)
  const taskGraphTotalWorkItems = Number(taskGraph?.total_work_items || 0)
  const workQueueTotalWorkItems = Number(workQueue?.total_work_items || 0)
  const schedulerTotalWorkItems = Number(scheduler?.total_work_items || 0)
  const targetActiveSlots = Number(input.targetActiveSlots || scheduler?.target_active_slots || taskGraph?.target_active_slots || input.roster?.agent_count || 0)
  const minimumWorkItems = Number(input.minimumWorkItems || taskGraph?.minimum_work_items || targetActiveSlots || 0)
  const taskGraphMatchesCliOptions = Boolean(taskGraph) && requestedWorkItems === taskGraphTotalWorkItems && targetActiveSlots === Number(taskGraph.target_active_slots || 0)
  const workQueueMatchesTaskGraph = Boolean(workQueue && taskGraph) && workQueueTotalWorkItems === taskGraphTotalWorkItems
  const schedulerMatchesWorkQueue = Boolean(scheduler && workQueue) && schedulerTotalWorkItems === workQueueTotalWorkItems
  const terminalReportsMatchGenerations = terminalCloseReportCount >= generationCount
  const taskGraphSourceRefsOk = Boolean(taskGraph?.work_items?.length) && taskGraph.work_items.every((item: any) => item.source_intelligence_refs)
  const taskGraphGoalRefsOk = Boolean(taskGraph?.work_items?.length) && taskGraph.work_items.every((item: any) => item.goal_mode_ref)
  const workQueueSourceRefsOk = Boolean(workQueue?.items?.length) && workQueue.items.every((item: any) => item.source_intelligence_refs)
  const workQueueGoalRefsOk = Boolean(workQueue?.items?.length) && workQueue.items.every((item: any) => item.goal_mode_ref)
  const route = String(input.route || taskGraph?.route_type || '$Agent')
  const routeCommand = String(input.routeCommand || 'sks agent run')
  const genericAgentRouteStandIn = !/\$?agent$/i.test(route) && /\bagent\s+run\b/i.test(routeCommand) && /--route/i.test(routeCommand)
  const realRouteCommandUsed = !genericAgentRouteStandIn
  const laneSupervisorIntegrated = Boolean(laneSupervisor)
  const blockers = [
    ...(lifecycle.ok ? [] : ['agent_lifecycle_not_all_closed']),
    ...(lifecycle.ok ? [] : lifecycle.open_sessions.map((id: string) => 'session_open:' + id)),
    ...((input.timeoutKill?.killed_sessions || []).map((id: string) => 'session_timeout_killed:' + id)),
    ...(terminal.ok ? [] : terminal.blockers),
    ...(generations.ok ? [] : generations.blockers),
    ...(!scheduler ? ['agent_scheduler_state_missing'] : []),
    ...(!workQueue ? ['agent_work_queue_missing'] : []),
    ...(!schedulerEvents.trim() ? ['agent_scheduler_events_missing'] : []),
    ...(!slots ? ['agent_worker_slots_missing'] : []),
    ...(!generationArtifact ? ['agent_session_generations_missing'] : []),
    ...(Array.isArray(scheduler?.blockers) ? scheduler.blockers : []),
    ...(scheduler && scheduler.pending_count > 0 && scheduler.active_slot_count === 0 ? ['scheduler_pending_queue_without_active_sessions'] : []),
    ...(scheduler && scheduler.pending_queue_drained !== true ? ['scheduler_pending_queue_not_drained'] : []),
    ...(scheduler && Number(scheduler.active_slot_count || 0) !== 0 ? ['scheduler_active_slots_not_zero_at_finalization'] : []),
    ...(scheduler && Number(scheduler.expected_backfill_count || 0) > Number(scheduler.backfill_count || 0) ? ['scheduler_backfill_count_below_expected'] : []),
    ...(scheduler && Number(scheduler.total_work_items || 0) >= Number(scheduler.target_active_slots || 0) && Number(scheduler.max_observed_active_slots || 0) !== Number(scheduler.target_active_slots || 0) ? ['scheduler_max_observed_active_slots_mismatch'] : []),
    ...(taskGraph && !taskGraphMatchesCliOptions ? ['task_graph_cli_options_mismatch'] : []),
    ...(workQueue && taskGraph && !workQueueMatchesTaskGraph ? ['work_queue_task_graph_mismatch'] : []),
    ...(scheduler && workQueue && !schedulerMatchesWorkQueue ? ['scheduler_work_queue_mismatch'] : []),
    ...(taskGraph && !taskGraphSourceRefsOk ? ['task_graph_source_refs_missing'] : []),
    ...(taskGraph && !taskGraphGoalRefsOk ? ['task_graph_goal_refs_missing'] : []),
    ...(workQueue && !workQueueSourceRefsOk ? ['work_queue_source_refs_missing'] : []),
    ...(workQueue && !workQueueGoalRefsOk ? ['work_queue_goal_refs_missing'] : []),
    ...(genericAgentRouteStandIn ? ['non_agent_route_used_generic_agent_run_route_standin'] : []),
    ...(generationCount < finalWorkItemCount ? ['session_generation_count_below_finished_work_items'] : []),
    ...(terminalCloseReportCount < generationCount ? ['terminal_close_report_count_below_generation_count'] : []),
    ...(slots && slots.all_slots_closed_after_drain !== true ? ['agent_worker_slots_not_closed_after_drain'] : []),
    ...(!laneSupervisor ? ['tmux_lane_supervisor_missing'] : []),
    ...(laneSupervisor && laneSupervisor.no_flicker_verified !== true ? ['tmux_lane_no_flicker_not_verified'] : []),
    ...(laneSupervisor && laneSupervisor.pane_survival_checked !== true ? ['tmux_lane_survival_not_checked'] : []),
    ...(laneSupervisor && Number(laneSupervisor.unexpected_close_count || 0) > 0 ? ['tmux_lane_unexpected_close_before_drain'] : []),
    ...(laneSupervisor?.blockers || []),
    ...(input.backend === 'tmux' && tmuxLanes?.ok !== true ? ['tmux_right_lane_manifest_missing'] : []),
    ...(input.backend === 'tmux' && tmuxPaneLaunchCount === 0 ? ['tmux_pane_launch_evidence_missing'] : []),
    ...(ledger.blockers || []),
    ...(input.partition?.blockers || []),
    ...(input.consensus?.blockers || []),
    ...(input.janitor?.ok === false ? input.janitor.blockers || ['agent_janitor_not_ok'] : []),
    ...(input.results || []).flatMap((result: any) => result.blockers || []),
    ...agentChangedFileLeaseViolations(input.results || [], input.partition?.leases || [])
  ]
  const evidence = {
    schema: AGENT_PROOF_EVIDENCE_SCHEMA,
    ok: blockers.length === 0,
    status: blockers.length ? 'blocked' : 'passed',
    generated_at: nowIso(),
    mission_id: input.missionId,
    backend: input.backend,
    route,
    route_command: routeCommand,
    route_blackbox_kind: input.routeBlackboxKind || (realRouteCommandUsed ? 'actual_route_command' : 'generic_agent_route_standin'),
    real_route_command_used: realRouteCommandUsed,
    real_parallel_claim: input.realParallel === true && input.backend === 'codex-exec',
    fake_backend_disclaimer: input.backend === 'fake' ? 'fixture only; no real parallel execution claim' : null,
    agent_count: input.roster?.agent_count || input.results?.length || 0,
    max_agents: input.roster?.max_agents || 20,
    all_sessions_closed: lifecycle.ok,
    launched_count: lifecycle.launched_count,
    closed_session_count: lifecycle.closed_session_count,
    terminal_sessions_closed: terminal.ok,
    terminal_session_count: terminal.total_sessions,
    terminal_generation_count: generations.generation_count,
    terminal_close_report_count: terminalCloseReportCount,
    terminal_close_report: 'sessions/<slot_id>/gen-<n>/agent-terminal-close-report.json',
    session_generation_count: generations.generation_count,
    all_generations_closed: generations.ok,
    scheduler_state: 'agent-scheduler-state.json',
    target_active_slots: targetActiveSlots,
    requested_work_items: requestedWorkItems,
    actual_total_work_items: taskGraphTotalWorkItems || schedulerTotalWorkItems,
    minimum_work_items: minimumWorkItems,
    task_graph_total_work_items: taskGraphTotalWorkItems,
    work_queue_total_work_items: workQueueTotalWorkItems,
    scheduler_total_work_items: schedulerTotalWorkItems,
    task_graph_matches_cli_options: taskGraphMatchesCliOptions,
    work_queue_matches_task_graph: workQueueMatchesTaskGraph,
    scheduler_matches_work_queue: schedulerMatchesWorkQueue,
    max_observed_active_slots: scheduler?.max_observed_active_slots || 0,
    pending_queue_drained: scheduler?.pending_queue_drained === true,
    backfill_count: scheduler?.backfill_count || 0,
    expected_backfill_count: scheduler?.expected_backfill_count || 0,
    backfill_expected_for_route: Number(scheduler?.expected_backfill_count || 0) > 0,
    slot_count: slots?.slot_count || 0,
    generation_count: generationCount,
    all_slots_closed_after_drain: slots?.all_slots_closed_after_drain === true,
    generated_work_item_count: scheduler?.generated_work_item_count || 0,
    source_intelligence_generation_refs_ok: generations.missing_source_intelligence_refs.length === 0,
    goal_mode_generation_refs_ok: generations.missing_goal_mode_refs.length === 0,
    task_graph_source_refs_ok: taskGraphSourceRefsOk,
    task_graph_goal_refs_ok: taskGraphGoalRefsOk,
    work_queue_source_refs_ok: workQueueSourceRefsOk,
    work_queue_goal_refs_ok: workQueueGoalRefsOk,
    tmux_lane_manifest: 'agent-tmux-lanes.json',
    tmux_lane_manifest_ok: tmuxLanes?.ok === true,
    tmux_lane_supervisor: 'agent-tmux-lane-supervisor.json',
    lane_supervisor_integrated: laneSupervisorIntegrated,
    tmux_lane_no_flicker_verified: laneSupervisor?.no_flicker_verified === true,
    tmux_lane_survival_checked: laneSupervisor?.pane_survival_checked === true,
    tmux_lane_unexpected_close_count: laneSupervisor?.unexpected_close_count || 0,
    tmux_lane_auto_reopen_count: laneSupervisor?.auto_reopen_count || 0,
    tmux_pane_launch_ledger: 'agent-tmux-pane-launch-ledger.jsonl',
    tmux_pane_launch_count: tmuxPaneLaunchCount,
    terminal_reports_match_generations: terminalReportsMatchGenerations,
    ledger_hash_chain_ok: ledger.ok,
    no_overlap_ok: input.partition?.no_overlap_proof?.ok !== false,
    consensus_ok: input.consensus?.ok === true,
    output_tail_report: 'agent-output-tails.json',
    output_tail_records: Number(input.outputTails?.record_count || 0),
    timeout_kill_report: 'agent-timeout-kill-report.json',
    timeout_killed_sessions: Array.isArray(input.timeoutKill?.killed_sessions) ? input.timeoutKill.killed_sessions : [],
    cleanup_report: 'agent-cleanup.json',
    janitor_report: 'agent-janitor-report.json',
    janitor_ok: input.janitor?.ok !== false,
    trust_report: 'agent-trust-report.json',
    wrongness_records: 'agent-wrongness-records.json',
    changed_files_lease_checked: true,
    dependency_collision_risk: input.partition?.no_overlap_proof?.dependency_collision_risk || [],
    blockers
  }
  await writeJsonAtomic(path.join(root, 'agent-proof-evidence.json'), evidence)
  return evidence
}

export async function readAgentProofEvidence(root: string, missionId: string) {
  return readJson(path.join(root, '.sneakoscope', 'missions', missionId, 'agents', 'agent-proof-evidence.json'), null)
}

async function readTextSafe(file: string) {
  try {
    const fs = await import('node:fs/promises')
    return await fs.readFile(file, 'utf8')
  } catch {
    return ''
  }
}

function agentChangedFileLeaseViolations(results: any[], leases: any[]) {
  const activeWrites = leases.filter((lease) => lease.kind === 'write' && lease.status !== 'released')
  const violations: string[] = []
  for (const result of results) {
    const agentId = result.agent_id
    for (const file of result.changed_files || []) {
      const normalized = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '')
      const allowed = activeWrites.some((lease) => lease.agent_id === agentId && pathWithin(normalized, lease.path))
      if (!allowed) violations.push('lease_changed_file_violation:' + agentId + ':' + normalized)
    }
  }
  return violations
}

function pathWithin(file: string, leasePath: string) {
  const left = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const right = String(leasePath || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  return left === right || left.startsWith(right + '/')
}

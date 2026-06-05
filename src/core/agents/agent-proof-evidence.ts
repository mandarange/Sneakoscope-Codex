import path from 'node:path'
import { AGENT_PROOF_EVIDENCE_SCHEMA } from './agent-schema.js'
import { nowIso, PACKAGE_VERSION, readJson, writeJsonAtomic } from '../fsx.js'
import { validateAgentLedgerHashChain } from './agent-central-ledger.js'
import { assertAllAgentSessionsClosed } from './agent-lifecycle.js'
import { assertAgentTerminalSessionsClosed } from './agent-terminal-session.js'
import { assertAgentSessionGenerationsClosed } from './agent-session-generation.js'
import { readZellijLaneSupervisor } from './zellij-lane-supervisor.js'
import { writeFakeRealProofPolicyReport } from '../proof/fake-real-proof-policy.js'
import { buildRuntimeTruthMatrix, writeRuntimeTruthMatrix } from '../proof/runtime-truth-matrix.js'
import { evaluateLocalCollaborationFinalGate, localCollaborationParticipated, resolveLocalCollaborationPolicy } from '../local-llm/local-collaboration-policy.js'

export async function writeAgentProofEvidence(root: string, input: { missionId: string; backend: string; route?: string; routeCommand?: string; routeBlackboxKind?: string; requestedWorkItems?: number; minimumWorkItems?: number; targetActiveSlots?: number; visualLaneCount?: number; realParallel?: boolean; roster?: any; partition?: any; consensus?: any; results?: any[]; cleanup?: any; janitor?: any; trust?: any; wrongness?: any; outputTails?: any; timeoutKill?: any; scheduler?: any; parallelWritePolicy?: any; gitWorktreeRuntime?: any; patchSwarm?: any; strategyGate?: any; nativeCliSessionProof?: any; noSubagentScalingPolicy?: any; fastModePolicy?: any; fastModePropagation?: any; triwikiContext?: any; selectedCoreSkill?: any; localCollaborationPolicy?: any; gptFinalArbiter?: any; finalGptPatchStage?: any }) {
  const lifecycle = await assertAllAgentSessionsClosed(root)
  const terminal = await assertAgentTerminalSessionsClosed(root)
  const generations = await assertAgentSessionGenerationsClosed(root)
  const ledger = await validateAgentLedgerHashChain(root)
  const zellijLanes = await readJson<any>(path.join(root, 'agent-zellij-lanes.json'), null)
  const laneSupervisor = await readZellijLaneSupervisor(root)
  const zellijRuntimeManifest = await readJson<any>(path.join(root, 'zellij-lane-runtime.json'), null)
  const workQueue = await readJson<any>(path.join(root, 'agent-work-queue.json'), null)
  const scheduler = input.scheduler || await readJson<any>(path.join(root, 'agent-scheduler-state.json'), null)
  const taskGraph = input.partition?.task_graph || await readJson<any>(path.join(root, 'agent-task-graph.json'), null)
  const parallelWritePolicy = input.parallelWritePolicy || await readJson<any>(path.join(root, 'agent-parallel-write-policy.json'), null)
  const gitWorktreeRuntime = input.gitWorktreeRuntime || await readJson<any>(path.join(root, 'agent-git-worktree-runtime.json'), null)
  const patchQueue = await readJson<any>(path.join(root, 'agent-patch-queue.json'), null)
  const patchQueueEvents = await readTextSafe(path.join(root, 'agent-patch-queue-events.jsonl'))
  const patchMerge = await readJson<any>(path.join(root, 'agent-merge-coordinator-report.json'), null)
  const patchApplyResults = await readJson<any>(path.join(root, 'agent-patch-apply-results.json'), null)
  const patchVerificationResults = await readJson<any>(path.join(root, 'agent-patch-verification-results.json'), null)
  const patchRollbackProof = await readJson<any>(path.join(root, 'agent-patch-rollback-proof.json'), null)
  const patchProof = await readJson<any>(path.join(root, 'agent-patch-proof.json'), null)
  const patchSwarm = input.patchSwarm || await readJson<any>(path.join(root, 'agent-patch-swarm-runtime.json'), null)
  const localCollaborationPolicy = input.localCollaborationPolicy || await readJson<any>(path.join(root, 'local-collaboration-policy.json'), null) || resolveLocalCollaborationPolicy()
  const gptFinalArbiter = input.gptFinalArbiter || await readJson<any>(path.join(root, 'gpt-final-arbiter', 'gpt-final-arbiter.json'), null)
  const narutoWorkGraph = await readJson<any>(path.join(root, 'naruto-work-graph.json'), null)
  const narutoRoleDistribution = await readJson<any>(path.join(root, 'naruto-role-distribution.json'), null)
  const narutoConcurrencyGovernor = await readJson<any>(path.join(root, 'naruto-concurrency-governor.json'), null)
  const narutoActivePool = await readJson<any>(path.join(root, 'naruto-active-pool.json'), null)
  const narutoVerificationDag = await readJson<any>(path.join(root, 'naruto-verification-dag.json'), null)
  const narutoGptFinalPack = await readJson<any>(path.join(root, 'naruto-gpt-final-pack.json'), null)
  const narutoZellijDashboard = await readJson<any>(path.join(root, 'naruto-zellij-dashboard.json'), null)
  const localParticipated = localCollaborationParticipated(input.results || []) || Number(gptFinalArbiter?.local_outputs_count || 0) > 0
  const finalGptPatchStage = input.finalGptPatchStage || null
  const localFinalGate = gptFinalArbiter?.final_gate || evaluateLocalCollaborationFinalGate({
    policy: localCollaborationPolicy,
    localParticipated,
    gptFinalStatus: gptFinalArbiter?.result?.status || null,
    gptFinalAvailable: Boolean(gptFinalArbiter),
    gptFinalBackend: gptFinalArbiter?.backend || null,
    applyPatches: parallelWritePolicy?.apply_patches === true
  })
  const nativeCliSessionProof = input.nativeCliSessionProof || await readJson<any>(path.join(root, 'native-cli-session-proof.json'), null)
  const noSubagentScalingPolicy = input.noSubagentScalingPolicy || await readJson<any>(path.join(root, 'no-subagent-scaling-policy.json'), null)
  const fastModePropagation = input.fastModePropagation || await readJson<any>(path.join(root, 'fast-mode-propagation-proof.json'), null)
  const zellijPaneProof = await readJson<any>(path.join(root, 'zellij-pane-proof.json'), null)
  const cleanupProof = await readJson<any>(path.join(root, 'agent-cleanup-proof.json'), null)
  const intelligentWorkGraph = await readJson<any>(path.join(root, 'agent-intelligent-work-graph.json'), null)
  const slots = await readJson<any>(path.join(root, 'agent-worker-slots.json'), null)
  const generationArtifact = await readJson<any>(path.join(root, 'agent-session-generations.json'), null)
  const strategyGate = input.strategyGate || await readJson<any>(path.join(root, 'strategy-gate.json'), null)
  const schedulerEvents = await readTextSafe(path.join(root, 'agent-scheduler-events.jsonl'))
  const zellijLaunchLedger = await readTextSafe(path.join(root, 'agent-zellij-pane-launch-ledger.jsonl'))
  const zellijPaneLaunchCount = zellijLaunchLedger.split(/\n/).filter(Boolean).length
  const terminalCloseReportCount = terminal.total_sessions || 0
  const generationCount = generations.generation_count || 0
  const finalWorkItemCount = Number(scheduler?.completed_count || 0) + Number(scheduler?.failed_count || 0) + Number(scheduler?.blocked_count || 0)
  const requestedWorkItems = Number(input.requestedWorkItems || taskGraph?.desired_work_items || taskGraph?.total_work_items || 0)
  const taskGraphTotalWorkItems = Number(taskGraph?.total_work_items || 0)
  const workQueueTotalWorkItems = Number(workQueue?.total_work_items || 0)
  const schedulerTotalWorkItems = Number(scheduler?.total_work_items || 0)
  const targetActiveSlots = Number(input.targetActiveSlots || scheduler?.target_active_slots || taskGraph?.target_active_slots || input.roster?.agent_count || 0)
  const visualLaneCount = Number(input.visualLaneCount || zellijLanes?.lane_count || laneSupervisor?.lane_count || targetActiveSlots || 0)
  const minimumWorkItems = Number(input.minimumWorkItems || taskGraph?.minimum_work_items || targetActiveSlots || 0)
  const taskGraphMatchesCliOptions = Boolean(taskGraph) && requestedWorkItems === taskGraphTotalWorkItems && targetActiveSlots === Number(taskGraph.target_active_slots || 0)
  const workQueueMatchesTaskGraph = Boolean(workQueue && taskGraph) && workQueueTotalWorkItems === taskGraphTotalWorkItems
  const schedulerMatchesWorkQueue = Boolean(scheduler && workQueue) && schedulerTotalWorkItems === workQueueTotalWorkItems
  const terminalReportsMatchGenerations = terminalCloseReportCount >= generationCount
  const taskGraphSourceRefsOk = Boolean(taskGraph?.work_items?.length) && taskGraph.work_items.every((item: any) => item.source_intelligence_refs)
  const taskGraphGoalRefsOk = Boolean(taskGraph?.work_items?.length) && taskGraph.work_items.every((item: any) => item.goal_mode_ref)
  const taskGraphStrategyRefsOk = Boolean(taskGraph?.work_items?.length) && taskGraph.work_items.every((item: any) => item.strategy_refs)
  const workQueueSourceRefsOk = Boolean(workQueue?.items?.length) && workQueue.items.every((item: any) => item.source_intelligence_refs)
  const workQueueGoalRefsOk = Boolean(workQueue?.items?.length) && workQueue.items.every((item: any) => item.goal_mode_ref)
  const workQueueStrategyRefsOk = Boolean(workQueue?.items?.length) && workQueue.items.every((item: any) => item.slice?.strategy_refs)
  const route = String(input.route || taskGraph?.route_type || '$Agent')
  const isNarutoRoute = route === '$Naruto'
  const routeCommand = String(input.routeCommand || 'sks agent run')
  const genericAgentRouteStandIn = !/\$?agent$/i.test(route) && /\bagent\s+run\b/i.test(routeCommand) && /--route/i.test(routeCommand)
  const realRouteCommandUsed = !genericAgentRouteStandIn
  const laneSupervisorIntegrated = Boolean(laneSupervisor)
  const zellijSpawnOnDemandSupervisor = Boolean(laneSupervisor)
    && Number(laneSupervisor?.lane_count || 0) === 0
    && Array.isArray(laneSupervisor?.lanes)
    && laneSupervisor.lanes.length === 0
    && Number(zellijRuntimeManifest?.lane_count || 0) === 0
    && Array.isArray(zellijRuntimeManifest?.lanes)
    && zellijRuntimeManifest.lanes.length === 0
  const zellijLaneRuntimePolicyOk = zellijSpawnOnDemandSupervisor || Boolean(laneSupervisor)
    && Array.isArray(laneSupervisor?.lanes)
    && laneSupervisor.lanes.length > 0
    && laneSupervisor.lanes.every((lane: any) => lane?.dispatch_mode === 'jsonl_nonblocking'
      && lane?.command_inbox
      && lane?.state_dir
      && lane?.runtime?.dispatch?.fifo_policy === 'disabled_to_avoid_writer_blocking')
  const zellijLanePaneIdSourceOk = Boolean(laneSupervisor)
    && Array.isArray(laneSupervisor?.lanes)
    && laneSupervisor.lanes.every((lane: any) => typeof lane?.pane_id_source === 'string' && lane.pane_id_source.length > 0)
  const patchEntries = Array.isArray(patchQueue?.entries) ? patchQueue.entries : []
  const patchApplyRows = Array.isArray(patchApplyResults?.results) ? patchApplyResults.results : []
  const patchQueuePendingCount = Number(patchQueue?.queued_count || patchEntries.filter((entry: any) => entry.status === 'pending').length || 0)
  const patchConflictCount = Number(patchMerge?.conflicts?.length || patchMerge?.serial_conflicts?.length || 0)
  const serialBottleneckCount = Number(patchMerge?.serial_conflicts?.length || 0)
  const patchQueueOk = patchSwarm ? Boolean(patchQueue) && patchQueuePendingCount === 0 : true
  const patchApplyOk = patchSwarm ? patchApplyRows.every((row: any) => row.ok !== false) : true
  const patchVerificationOk = patchSwarm ? patchVerificationResults?.ok !== false && patchApplyRows.every((row: any) => {
    const changed = Array.isArray(row.changed_files) && row.changed_files.length > 0
    return !changed || (row.verification?.status && row.verification.status !== 'failed')
  }) : true
  const patchRollbackOk = patchSwarm ? patchRollbackProof?.ok !== false && patchApplyRows.every((row: any) => {
    const changed = Array.isArray(row.changed_files) && row.changed_files.length > 0
    return !changed || Boolean(row.rollback_digest)
  }) : true
  const parallelPatchApplyVerified = patchSwarm ? Array.isArray(patchProof?.wall_clock_parallel_evidence) && patchProof.wall_clock_parallel_evidence.length > 0 || Number(patchSwarm?.parallel_apply_count || 0) > 1 : false
  const readOnlyNoWriteLeaseMode = isReadOnlyNoWriteLeaseMode({
    results: input.results || [],
    leases: input.partition?.leases || [],
    parallelWritePolicy,
    taskGraph,
    narutoWorkGraph
  })
  const changedFileLeaseBlockers = readOnlyNoWriteLeaseMode ? [] : agentChangedFileLeaseViolations(input.results || [], input.partition?.leases || [])
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
    ...(taskGraph && !taskGraphStrategyRefsOk ? ['task_graph_strategy_refs_missing'] : []),
    ...(workQueue && !workQueueSourceRefsOk ? ['work_queue_source_refs_missing'] : []),
    ...(workQueue && !workQueueGoalRefsOk ? ['work_queue_goal_refs_missing'] : []),
    ...(workQueue && !workQueueStrategyRefsOk ? ['work_queue_strategy_refs_missing'] : []),
    ...(strategyGate?.ok === false ? strategyGate.blockers || ['strategy_gate_not_ok'] : []),
    ...(genericAgentRouteStandIn ? ['non_agent_route_used_generic_agent_run_route_standin'] : []),
    ...(generationCount < finalWorkItemCount ? ['session_generation_count_below_finished_work_items'] : []),
    ...(terminalCloseReportCount < generationCount ? ['terminal_close_report_count_below_generation_count'] : []),
    ...(slots && slots.all_slots_closed_after_drain !== true ? ['agent_worker_slots_not_closed_after_drain'] : []),
    ...(!laneSupervisor ? ['zellij_lane_supervisor_missing'] : []),
    ...(laneSupervisor && !zellijSpawnOnDemandSupervisor && visualLaneCount > 0 && Number(laneSupervisor.lane_count || 0) < visualLaneCount ? ['zellij_lane_count_below_visual_lane_count'] : []),
    ...(laneSupervisor && laneSupervisor.no_flicker_verified !== true ? ['zellij_lane_no_flicker_not_verified'] : []),
    ...(laneSupervisor && laneSupervisor.pane_survival_checked !== true ? ['zellij_lane_survival_not_checked'] : []),
    ...(laneSupervisor && Number(laneSupervisor.unexpected_close_count || 0) > 0 ? ['zellij_lane_unexpected_close_before_drain'] : []),
    ...(laneSupervisor && !zellijLaneRuntimePolicyOk ? ['zellij_lane_runtime_policy_missing'] : []),
    ...(laneSupervisor && !zellijLanePaneIdSourceOk ? ['zellij_lane_pane_id_source_missing'] : []),
    ...(laneSupervisor?.blockers || []),
    ...(input.backend === 'zellij' && zellijPaneProof?.ok !== true ? ['zellij_pane_proof_missing'] : []),
    ...(input.backend === 'zellij' && Array.isArray(zellijPaneProof?.blockers) ? zellijPaneProof.blockers : []),
    ...(input.backend === 'zellij' && zellijLanes?.ok !== true ? ['zellij_right_lane_manifest_missing'] : []),
    ...(input.backend === 'zellij' && zellijPaneLaunchCount === 0 ? ['zellij_pane_launch_evidence_missing'] : []),
    ...(ledger.blockers || []),
    ...(input.partition?.blockers || []),
    ...(input.consensus?.blockers || []),
    ...(input.janitor?.ok === false ? input.janitor.blockers || ['agent_janitor_not_ok'] : []),
    ...(cleanupProof?.ok === false ? cleanupProof.blockers || ['agent_cleanup_proof_not_ok'] : []),
    ...(input.results || []).flatMap((result: any) => result.blockers || []),
    ...(nativeCliSessionProof?.ok === false ? nativeCliSessionProof.blockers || ['native_cli_session_proof_not_ok'] : []),
    ...(noSubagentScalingPolicy?.ok === false ? noSubagentScalingPolicy.blockers || ['no_subagent_scaling_policy_not_ok'] : []),
    ...(fastModePropagation?.ok === false ? fastModePropagation.blockers || ['fast_mode_propagation_not_ok'] : []),
    ...(patchSwarm?.ok === false ? patchSwarm.blockers || ['patch_swarm_not_ok'] : []),
    ...(gitWorktreeRuntime?.required === true && gitWorktreeRuntime?.ok === false ? gitWorktreeRuntime.blockers || ['git_worktree_runtime_not_ok'] : []),
    ...(patchSwarm && !patchQueue ? ['patch_queue_missing'] : []),
    ...(patchSwarm && !patchMerge ? ['patch_merge_report_missing'] : []),
    ...(patchSwarm && !patchApplyResults ? ['patch_apply_results_missing'] : []),
    ...(patchSwarm && !patchVerificationResults ? ['patch_verification_results_missing'] : []),
    ...(patchSwarm && !patchRollbackProof ? ['patch_rollback_proof_missing'] : []),
    ...(patchSwarm && patchProof?.ok === false ? patchProof.blockers || ['patch_proof_not_ok'] : []),
    ...(patchSwarm && !patchQueueOk ? ['patch_queue_not_ok'] : []),
    ...(patchSwarm && !patchApplyOk ? ['patch_apply_not_ok'] : []),
    ...(patchSwarm && !patchVerificationOk ? ['patch_verification_not_ok'] : []),
    ...(patchSwarm && !patchRollbackOk ? ['patch_rollback_not_ok'] : []),
    ...(localParticipated && localFinalGate.ok !== true ? localFinalGate.blockers || ['gpt_final_arbiter_gate_not_ok'] : []),
    ...(localParticipated && gptFinalArbiter?.ok !== true ? gptFinalArbiter?.blockers || ['gpt_final_arbiter_not_ok'] : []),
    ...(localParticipated && finalGptPatchStage?.ok === false ? finalGptPatchStage.blockers || ['final_gpt_patch_stage_not_ok'] : []),
    ...(isNarutoRoute && !narutoWorkGraph ? ['naruto_work_graph_missing'] : []),
    ...(isNarutoRoute && narutoWorkGraph?.ok === false ? narutoWorkGraph.blockers || ['naruto_work_graph_not_ok'] : []),
    ...(isNarutoRoute && !narutoRoleDistribution ? ['naruto_role_distribution_missing'] : []),
    ...(isNarutoRoute && narutoRoleDistribution?.ok === false ? narutoRoleDistribution.blockers || ['naruto_role_distribution_not_ok'] : []),
    ...(isNarutoRoute && !narutoConcurrencyGovernor ? ['naruto_concurrency_governor_missing'] : []),
    ...(isNarutoRoute && !narutoActivePool ? ['naruto_active_pool_missing'] : []),
    ...(isNarutoRoute && narutoActivePool?.ok === false ? narutoActivePool.blockers || ['naruto_active_pool_not_ok'] : []),
    ...(isNarutoRoute && !narutoVerificationDag ? ['naruto_verification_dag_missing'] : []),
    ...(isNarutoRoute && !narutoGptFinalPack ? ['naruto_gpt_final_pack_missing'] : []),
    ...(isNarutoRoute && !narutoZellijDashboard ? ['naruto_zellij_dashboard_missing'] : []),
    ...changedFileLeaseBlockers
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
    // Deployed Core Skill snapshot consulted at route start (read-only; never
    // confers mutation rights). Null when no snapshot is deployed for this route.
    selected_core_skill: input.selectedCoreSkill || null,
    git_worktree_runtime: gitWorktreeRuntime,
    route_blackbox_kind: input.routeBlackboxKind || (realRouteCommandUsed ? 'actual_route_command' : 'generic_agent_route_standin'),
    real_route_command_used: realRouteCommandUsed,
    native_cli_session_proof: nativeCliSessionProof ? 'native-cli-session-proof.json' : null,
    native_cli_session_swarm: nativeCliSessionProof ? 'agent-native-cli-session-swarm.json' : null,
    no_subagent_scaling_policy: noSubagentScalingPolicy ? 'no-subagent-scaling-policy.json' : null,
    fast_mode_policy: input.fastModePolicy || null,
    fast_mode_propagation: fastModePropagation ? 'fast-mode-propagation-proof.json' : null,
    native_cli_worker_process_count: Number(nativeCliSessionProof?.spawned_worker_process_count || 0),
    native_cli_max_observed_worker_process_count: Number(nativeCliSessionProof?.max_observed_worker_process_count || 0),
    native_cli_unique_worker_session_count: Number(nativeCliSessionProof?.unique_worker_session_count || 0),
    native_cli_subagent_scaling_blocked: noSubagentScalingPolicy?.ok === true,
    service_tier: input.fastModePolicy?.service_tier || fastModePropagation?.service_tier || 'fast',
    fast_mode: input.fastModePolicy?.fast_mode !== false,
    parallel_write_policy: 'agent-parallel-write-policy.json',
    strategy_gate: 'strategy-gate.json',
    strategy_gate_ok: strategyGate?.ok === true,
    strategy_scheduler_allowed: strategyGate?.scheduler_allowed === true,
    parallel_write_route_flags_wired: parallelWritePolicy?.route_level_flags_wired === true,
    parallel_write_mode: parallelWritePolicy?.write_mode || 'off',
    parallel_write_apply_patches: parallelWritePolicy?.apply_patches === true,
    parallel_write_dry_run_patches: parallelWritePolicy?.dry_run_patches === true,
    parallel_write_max_write_agents: Number(parallelWritePolicy?.max_write_agents || 0),
    local_collaboration_policy: 'local-collaboration-policy.json',
    local_collaboration_mode: localCollaborationPolicy.mode || null,
    local_collaboration_participated: localParticipated,
    gpt_final_arbiter: gptFinalArbiter ? 'gpt-final-arbiter/gpt-final-arbiter.json' : null,
    gpt_final_status: gptFinalArbiter?.result?.status || (localParticipated ? 'missing' : 'not_required_no_local_outputs'),
    gpt_final_backend: gptFinalArbiter?.backend || null,
    gpt_final_patch_source: finalGptPatchStage?.final_patch_source || (localParticipated ? 'blocked' : 'not_applicable'),
    gpt_final_gate_ok: localFinalGate.ok === true,
    gpt_final_gate: localFinalGate,
    naruto_work_graph: narutoWorkGraph ? 'naruto-work-graph.json' : null,
    naruto_total_work_items: Number(narutoWorkGraph?.total_work_items || 0),
    naruto_mixed_work_kinds: narutoWorkGraph?.mixed_work_kinds || [],
    naruto_write_allowed_count: Number(narutoWorkGraph?.write_allowed_count || 0),
    naruto_role_distribution: narutoRoleDistribution ? 'naruto-role-distribution.json' : null,
    naruto_role_distribution_entries: narutoRoleDistribution?.entries || [],
    naruto_verifier_only: narutoRoleDistribution?.verifier_only === true,
    naruto_implementation_like_ratio: Number(narutoRoleDistribution?.implementation_like_ratio || 0),
    naruto_concurrency_governor: narutoConcurrencyGovernor ? 'naruto-concurrency-governor.json' : null,
    naruto_safe_active_workers: Number(narutoConcurrencyGovernor?.safe_active_workers || 0),
    naruto_safe_zellij_visible_panes: Number(narutoConcurrencyGovernor?.safe_zellij_visible_panes || 0),
    naruto_headless_workers: Number(narutoConcurrencyGovernor?.headless_workers || 0),
    naruto_active_pool: narutoActivePool ? 'naruto-active-pool.json' : null,
    naruto_active_pool_refill_events: Number(narutoActivePool?.refill_events || 0),
    naruto_verification_dag: narutoVerificationDag ? 'naruto-verification-dag.json' : null,
    naruto_gpt_final_pack: narutoGptFinalPack ? 'naruto-gpt-final-pack.json' : null,
    naruto_zellij_dashboard: narutoZellijDashboard ? 'naruto-zellij-dashboard.json' : null,
    patch_swarm_runtime: patchSwarm ? 'agent-patch-swarm-runtime.json' : null,
    patch_queue: patchSwarm ? 'agent-patch-queue.json' : null,
    patch_queue_events: patchSwarm ? 'agent-patch-queue-events.jsonl' : null,
    patch_queue_event_count: patchQueueEvents.split(/\n/).filter(Boolean).length,
    patch_proof: patchSwarm ? 'agent-patch-proof.json' : null,
    patch_queue_ok: patchQueueOk,
    patch_apply_ok: patchApplyOk,
    patch_verification_ok: patchVerificationOk,
    patch_rollback_ok: patchRollbackOk,
    parallel_patch_apply_verified: parallelPatchApplyVerified,
    patch_conflict_count: patchConflictCount,
    serial_bottleneck_count: serialBottleneckCount,
    changed_files_by_agent: changedFilesByAgent(patchApplyRows, patchEntries),
    lease_compliance_by_patch: leaseComplianceByPatch(patchEntries, input.partition?.leases || []),
    rollback_digest_count: patchApplyRows.filter((row: any) => row.rollback_digest).length,
    real_parallel_claim: input.realParallel === true && input.backend === 'codex-sdk',
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
    visual_lane_count: visualLaneCount,
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
    task_graph_strategy_refs_ok: taskGraphStrategyRefsOk,
    work_queue_strategy_refs_ok: workQueueStrategyRefsOk,
    zellij_lane_manifest: 'agent-zellij-lanes.json',
    zellij_lane_manifest_ok: zellijLanes?.ok === true,
    zellij_lane_supervisor: 'agent-zellij-lane-supervisor.json',
    lane_supervisor_integrated: laneSupervisorIntegrated,
    zellij_lane_runtime_manifest: zellijRuntimeManifest ? 'zellij-lane-runtime.json' : null,
    zellij_spawn_on_demand_supervisor: zellijSpawnOnDemandSupervisor,
    zellij_lane_runtime_policy_ok: zellijLaneRuntimePolicyOk,
    zellij_lane_dispatch_mode: laneSupervisor?.dispatch_mode || zellijRuntimeManifest?.dispatch_mode || null,
    zellij_lane_fifo_policy: laneSupervisor?.fifo_policy || zellijRuntimeManifest?.fifo_policy || null,
    zellij_lane_resource_throttle_ms: laneSupervisor?.resource_throttle_ms || zellijRuntimeManifest?.resource_throttle_ms || null,
    zellij_lane_nice_level: laneSupervisor?.nice_level ?? zellijRuntimeManifest?.nice_level ?? null,
    zellij_lane_pane_id_source_ok: zellijLanePaneIdSourceOk,
    zellij_lane_no_flicker_verified: laneSupervisor?.no_flicker_verified === true,
    zellij_lane_survival_checked: laneSupervisor?.pane_survival_checked === true,
    zellij_lane_unexpected_close_count: laneSupervisor?.unexpected_close_count || 0,
    zellij_lane_auto_reopen_count: laneSupervisor?.auto_reopen_count || 0,
    zellij_pane_launch_ledger: 'agent-zellij-pane-launch-ledger.jsonl',
    zellij_pane_launch_count: zellijPaneLaunchCount,
    zellij_pane_verified: zellijPaneProof?.ok === true,
    zellij_pane_proof: 'zellij-pane-proof.json',
    zellij_pane_count: zellijPaneProof?.pane_count ?? null,
    real_truth_summary: {
      fake_backend: input.backend === 'fake',
      zellij_pane_verified: zellijPaneProof?.ok === true,
      real_zellij_status: zellijPaneProof ? (zellijPaneProof.ok === true ? 'passed' : 'blocked') : (input.backend === 'zellij' ? 'missing' : 'not_applicable'),
      cleanup_executor_status: cleanupProof?.ok === true ? 'passed' : cleanupProof ? 'blocked' : 'not_run',
      work_graph_quality_score: Number(intelligentWorkGraph?.work_graph_quality_score || taskGraph?.work_graph_quality_score || 0),
      fake_vs_real_policy: 'fake-real-proof-policy.json'
    },
    intelligent_work_graph: 'agent-intelligent-work-graph.json',
    test_ownership_map: 'agent-test-ownership-map.json',
    critical_path: 'agent-critical-path.json',
    integration_bottlenecks: 'agent-integration-bottlenecks.json',
    work_graph_quality_score: Number(intelligentWorkGraph?.work_graph_quality_score || taskGraph?.work_graph_quality_score || 0),
    work_graph_quality_partial: Number(intelligentWorkGraph?.work_graph_quality_score || taskGraph?.work_graph_quality_score || 0) < 0.55,
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
    triwiki_context: 'agent-triwiki-context.json',
    triwiki_context_consulted: input.triwikiContext?.present === true,
    context_pack_hash: input.triwikiContext?.context_pack_hash || null,
    triwiki_use_first_count: Number(input.triwikiContext?.use_first?.length || 0),
    triwiki_hydrate_first_count: Number(input.triwikiContext?.hydrate_first?.length || 0),
    triwiki_claim_count: Number(input.triwikiContext?.claim_count || 0),
    changed_files_lease_checked: !readOnlyNoWriteLeaseMode,
    dependency_collision_risk: input.partition?.no_overlap_proof?.dependency_collision_risk || [],
    blockers
  }
  await writeJsonAtomic(path.join(root, 'agent-proof-evidence.json'), evidence)
  await writeFakeRealProofPolicyReport(root, evidence)
  const runtimeTruthMatrix = await buildRuntimeTruthMatrix({
    root: repoRootFromAgentRoot(root),
    agentRoot: root,
    releaseVersion: PACKAGE_VERSION,
    reports: {
      'zellij-pane-proof.json': zellijPaneProof,
      'agent-cleanup-proof.json': cleanupProof,
      'agent-intelligent-work-graph.json': intelligentWorkGraph,
      'source-intelligence-evidence.json': input.partition?.source_intelligence_refs,
      'goal-mode-applied.json': input.partition?.goal_mode_ref,
      'agent-scheduler-state.json': scheduler
      , 'strategy-gate.json': strategyGate
      , 'agent-patch-proof.json': patchProof
      , 'agent-patch-swarm-runtime.json': patchSwarm
      , 'gpt-final-arbiter/gpt-final-arbiter.json': gptFinalArbiter
      , 'native-cli-session-proof.json': nativeCliSessionProof
      , 'no-subagent-scaling-policy.json': noSubagentScalingPolicy
      , 'fast-mode-propagation-proof.json': fastModePropagation
    }
  })
  await writeRuntimeTruthMatrix(repoRootFromAgentRoot(root), runtimeTruthMatrix, { agentRoot: root })
  return evidence
}

function changedFilesByAgent(applyRows: any[], queueEntries: any[]) {
  const entryAgents = new Map(queueEntries.map((entry) => [String(entry.id), String(entry.envelope?.agent_id || 'unknown')]))
  const out: Record<string, string[]> = {}
  for (const row of applyRows) {
    const agent = entryAgents.get(String(row.entry_id || '')) || 'unknown'
    out[agent] = [...new Set([...(out[agent] || []), ...((row.changed_files || []).map(String))])]
  }
  return out
}

function leaseComplianceByPatch(queueEntries: any[], leases: any[]) {
  return queueEntries.map((entry) => {
    const leaseId = entry.envelope?.lease_id || entry.envelope?.lease_proof?.lease_id || null
    const agentId = entry.envelope?.agent_id || null
    const paths = (entry.envelope?.operations || []).map((operation: any) => String(operation.path || ''))
    const lease = leases.find((candidate: any) => candidate.id === leaseId || (candidate.agent_id === agentId && paths.some((file: string) => pathWithin(file, candidate.path))))
    return {
      patch_entry_id: entry.id,
      agent_id: agentId,
      lease_id: leaseId,
      ok: Boolean(lease),
      write_paths: paths
    }
  })
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

function isReadOnlyNoWriteLeaseMode(input: { results: any[]; leases: any[]; parallelWritePolicy: any; taskGraph: any; narutoWorkGraph: any }) {
  const writeLeaseCount = input.leases.filter((lease) => lease.kind === 'write').length
  if (writeLeaseCount > 0) return false
  const resultWriteSignals = input.results.some((result) =>
    (Array.isArray(result?.writes) && result.writes.length > 0)
    || (Array.isArray(result?.patch_envelopes) && result.patch_envelopes.length > 0)
  )
  if (resultWriteSignals) return false
  const policyReadonly = input.parallelWritePolicy?.readonly === true
  const policyWriteOff = String(input.parallelWritePolicy?.write_mode || 'off') === 'off'
  const narutoReadOnly = input.narutoWorkGraph?.readonly === true || Number(input.narutoWorkGraph?.write_allowed_count || 0) === 0
  const taskGraphNoWrites = Number(input.taskGraph?.write_allowed_count || 0) === 0
  return policyReadonly || policyWriteOff || narutoReadOnly || taskGraphNoWrites
}

function pathWithin(file: string, leasePath: string) {
  const left = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const right = String(leasePath || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  return left === right || left.startsWith(right + '/')
}

function repoRootFromAgentRoot(agentRoot: string) {
  const normalized = path.resolve(agentRoot)
  const marker = `${path.sep}.sneakoscope${path.sep}missions${path.sep}`
  if (!normalized.includes(marker)) return normalized
  return path.resolve(normalized, '..', '..', '..', '..')
}

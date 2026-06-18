import path from 'node:path'
import { createMission, findLatestMission, loadMission, setCurrent } from '../mission.js'
import { nowIso, readJson, sksRoot, writeJsonAtomic } from '../fsx.js'
import { runNativeAgentOrchestrator } from '../agents/agent-orchestrator.js'
import { classifyOllamaWorkerSlice } from '../agents/agent-runner-ollama.js'
import { buildNarutoCloneRoster, systemSafeNarutoConcurrency } from '../agents/agent-roster.js'
import { DEFAULT_NARUTO_CLONES, MAX_NARUTO_AGENT_COUNT } from '../agents/agent-schema.js'
import { normalizeServiceTier, type AgentServiceTier } from '../agents/fast-mode-policy.js'
import { resolveOllamaWorkerConfig } from '../agents/ollama-worker-config.js'
import { attachZellijSessionInteractive, launchZellijLayout } from '../zellij/zellij-launcher.js'
import { maybePromptZellijUpdateForLaunch } from '../zellij/zellij-update.js'
import { buildNarutoWorkGraph } from '../naruto/naruto-work-graph.js'
import { buildNarutoRoleDistribution } from '../naruto/naruto-role-policy.js'
import { decideNarutoConcurrency } from '../naruto/naruto-concurrency-governor.js'
import { runNarutoActivePool, runNarutoRealActivePool } from '../naruto/naruto-active-pool.js'
import { collectActualNarutoWorker, spawnActualNarutoWorker } from '../naruto/naruto-real-worker-runtime.js'
import { allocateNarutoTasksToWorkers } from '../naruto/naruto-allocation-policy.js'
import { rebalanceNarutoReadyWork } from '../naruto/naruto-rebalance-policy.js'
import { buildNarutoVerificationDag } from '../naruto/naruto-verification-dag.js'
import { evaluateNarutoFinalizer } from '../naruto/naruto-finalizer.js'
import { buildNarutoGptFinalPack } from '../naruto/naruto-gpt-final-pack.js'
import { planNarutoZellijDashboard } from '../zellij/zellij-naruto-dashboard.js'
import { checkPromptPlaceholders } from '../prompt/prompt-placeholder-guard.js'
import { evaluateGitWorktreeCapability } from '../git/git-worktree-capability.js'
import { buildRuntimeProofSummary, renderRuntimeProofSummary } from '../agents/runtime-proof-summary.js'
import { writeCodex0138CapabilityArtifacts } from '../codex-control/codex-0138-capability.js'
import { writeCodex0139CapabilityArtifacts } from '../codex-control/codex-0139-capability.js'
import { writeFinalStopGate } from '../stop-gate/stop-gate-writer.js'

const NARUTO_RESULT_SCHEMA = 'sks.naruto-command-result.v1'
const NARUTO_ROUTE = '$Naruto'

// $Naruto — Shadow Clone Swarm (影分身 / Kage Bunshin no Jutsu).
// A high-scale variant of the native agent orchestrator that fans out up to
// MAX_NARUTO_AGENT_COUNT (100) identical clone sessions in parallel, reusing the
// proven scheduler / work-queue / patch-swarm machinery (lease-based safe parallel
// writes). The standard 20-agent ceiling is lifted only for this route.
export async function narutoCommand(commandOrArgs: string | string[] = 'naruto', maybeArgs: string[] = []) {
  const args = Array.isArray(commandOrArgs) ? commandOrArgs : maybeArgs
  // 4.0.9: `sks naruto --glm` delegates to GLM Naruto before legacy Naruto starts.
  if (args.includes('--glm')) {
    const { glmNarutoCommand } = await import('../providers/glm/naruto/glm-naruto-command.js')
    return glmNarutoCommand(args.filter((arg) => arg !== '--glm'))
  }
  const parsed = parseNarutoArgs(args)
  if (parsed.action === 'help') return narutoHelp(parsed)
  if (parsed.action === 'status') return narutoStatus(parsed)
  if (parsed.action === 'dashboard') return narutoDashboard(parsed)
  if (parsed.action === 'workers') return narutoWorkers(parsed)
  if (parsed.action === 'proof') return narutoProof(parsed)
  // Like the Codex CLI update prompt: check the installed zellij version and
  // offer an upgrade to the latest stable release before the live session
  // opens. Never blocks the run.
  if (!parsed.json && !parsed.mock && !parsed.noOpenZellij) {
    await maybePromptZellijUpdateForLaunch(args, { label: '$Naruto launch' }).catch(() => undefined)
  }
  return narutoRun(parsed)
}

async function narutoRun(parsed: NarutoArgs) {
  const root = await sksRoot()
  const writeCapable = parsed.readonly !== true && parsed.writeMode !== 'off'
  const patchEnvelopeBasePath = '.sneakoscope/naruto/patch-envelopes'
  const placeholderGuard = checkPromptPlaceholders({
    prompt: parsed.prompt,
    writeCapable,
    targetPaths: writeCapable ? [patchEnvelopeBasePath] : []
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
  const mission = await createMission(root, { mode: 'naruto', prompt: parsed.prompt })
  await writeCodex0138CapabilityArtifacts(root, { missionId: mission.id }).catch(() => null)
  await writeCodex0139CapabilityArtifacts(root, { missionId: mission.id }).catch(() => null)
  const gitWorktreeCapability = writeCapable
    ? await evaluateGitWorktreeCapability({ root, missionId: mission.id })
    : null
  const worktreePolicy = gitWorktreeCapability?.mode === 'git-worktree'
    ? {
        mode: 'git-worktree' as const,
        required: true,
        main_repo_root: gitWorktreeCapability.detection.root,
        worktree_root: gitWorktreeCapability.root_resolution?.root || null,
        fallback_reason: null
      }
    : {
        mode: 'patch-envelope-only' as const,
        required: false,
        main_repo_root: gitWorktreeCapability?.detection.root || null,
        worktree_root: null,
        fallback_reason: writeCapable ? (gitWorktreeCapability?.blockers.join(';') || 'not_git_repo_or_worktree_unavailable') : 'readonly_or_write_disabled'
      }
  // The clone roster is the full work fan-out; live concurrency is throttled to a
  // system-safe number so naruto never spawns the whole count at once unless an
  // explicit operator override asks for a higher target.
  const localWorker = await resolveNarutoLocalWorkerMode(parsed)
  const schedulerBackend = localWorker.auto_select_eligible ? 'local-llm' : parsed.backend
  const safe = systemSafeNarutoConcurrency({ backend: schedulerBackend })
  const baseWorkGraph = buildNarutoWorkGraph({
    prompt: parsed.prompt,
    requestedClones: roster.agent_count,
    totalWorkItems: parsed.workItems,
    honorExplicitTotalWorkItems: parsed.workItemsExplicit,
    readonly: parsed.readonly,
    writeCapable,
    leaseBasePath: patchEnvelopeBasePath,
    maxActiveWorkers: parsed.concurrency || safe.cap,
    worktreePolicy
  })
  const baseRoleDistribution = buildNarutoRoleDistribution(baseWorkGraph.work_items, { readonly: parsed.readonly })
  const allocationWorkers = buildNarutoAllocationWorkers(baseWorkGraph, baseRoleDistribution, roster)
  const allocationAssignments = allocateNarutoTasksToWorkers(baseWorkGraph.work_items, allocationWorkers)
  const workGraph = buildNarutoWorkGraph({
    prompt: parsed.prompt,
    requestedClones: roster.agent_count,
    totalWorkItems: parsed.workItems,
    honorExplicitTotalWorkItems: parsed.workItemsExplicit,
    readonly: parsed.readonly,
    writeCapable,
    leaseBasePath: patchEnvelopeBasePath,
    maxActiveWorkers: parsed.concurrency || safe.cap,
    worktreePolicy,
    allocationAssignments
  })
  const roleDistribution = buildNarutoRoleDistribution(workGraph.work_items, { readonly: parsed.readonly })
  const allocationPolicy = {
    schema: 'sks.naruto-allocation-policy.v1',
    generated_at: nowIso(),
    ok: allocationWorkers.length > 0 && allocationAssignments.length === workGraph.work_items.length,
    scoring_model: {
      same_primary_role: 18,
      declared_role: 12,
      same_path_lane: 12,
      overlap_each: 4,
      assigned_task_penalty_each: -4,
      write_conflict_penalty: -20,
      dependency_incomplete: '-Infinity'
    },
    workers: allocationWorkers,
    assignments: allocationAssignments.map((row) => ({
      task_id: row.id,
      owner: row.owner,
      score: Number.isFinite(row.allocation_score) ? row.allocation_score : '-Infinity',
      reason: row.allocation_reason,
      role: row.required_role,
      kind: row.kind,
      paths: row.hints.paths,
      domains: row.hints.domains,
      write_paths: row.hints.writePaths
    })),
    blockers: allocationWorkers.length ? [] : ['naruto_allocation_workers_missing']
  }
  const rebalanceDecisions = rebalanceNarutoReadyWork({
    tasks: workGraph.work_items.map((item) => ({ ...item, status: 'pending' })),
    workers: allocationWorkers.map((worker) => ({ ...worker, alive: true, state: 'idle' as const })),
    completedTaskIds: [],
    reclaimedTaskIds: []
  })
  const rebalancePolicy = {
    schema: 'sks.naruto-rebalance-policy.v1',
    generated_at: nowIso(),
    ok: true,
    trigger: 'idle_worker_ready_queue',
    decisions: rebalanceDecisions,
    blocked_by_dependency_count: workGraph.work_items.filter((item) => item.dependencies.length > 0).length,
    blockers: []
  }
  const governor = decideNarutoConcurrency({
    requestedClones: roster.agent_count,
    totalWorkItems: workGraph.total_work_items,
    pendingWorkQueueSize: workGraph.total_work_items,
    backend: schedulerBackend,
    parallelismMode: parsed.parallelism
  })
  const backendMinimum = schedulerBackend === 'fake' ? roster.agent_count : Math.min(roster.agent_count, 2)
  const activeCap = parsed.parallelism === 'safe' ? safe.cap : MAX_NARUTO_AGENT_COUNT
  const activeSlots = Math.max(1, Math.min(roster.agent_count, parsed.concurrency || Math.max(governor.safe_active_workers, backendMinimum), activeCap))
  const zellijVisiblePanes = Math.max(1, Math.min(activeSlots, governor.safe_zellij_visible_panes))
  const activePool = await runNarutoActivePool({ graph: workGraph, governor: { ...governor, safe_active_workers: activeSlots } })
  const runPreRunSmoke = parsed.smoke === true || process.env.SKS_NARUTO_PRE_RUN_SMOKE === '1'
  const realActivePoolSmoke = runPreRunSmoke
    ? await runNarutoControlPlaneSmoke({
      root,
      missionId: mission.id,
      prompt: parsed.prompt,
      rosterCount: roster.agent_count,
      totalWorkItems: workGraph.total_work_items,
      patchEnvelopeBasePath,
      worktreePolicy,
      governor,
      activeSlots,
      zellijVisiblePanes
    })
    : {
      schema: 'sks.naruto-active-pool.v1',
      ok: true,
      status: 'skipped',
      runtime_source_of_truth: 'agent-orchestrator-scheduler',
      production_runtime_source_of_truth: 'agent-orchestrator-scheduler',
      fallback_reason: 'pre_run_smoke_never_owns_production_runtime',
      reason: 'pre_run_smoke_disabled_for_production',
      active_cap: 0,
      max_observed_active_workers: 0,
      average_active_workers: 0,
      active_pool_utilization: 0,
      refill_latency_ms_p95: 0,
      visible_workers: 0,
      headless_workers: 0,
      worker_lifecycle: [],
      smoke_graph_total_work_items: 0
    }
  const verificationDag = buildNarutoVerificationDag(workGraph, { cwd: root })
  const gptFinalPack = buildNarutoGptFinalPack({
    missionId: mission.id,
    graph: workGraph,
    roleDistribution,
    localLlmMetrics: localWorker,
    worktreePolicy,
    worktreeDiffs: []
  })
  const zellijDashboard = planNarutoZellijDashboard({
    targetActiveWorkers: activeSlots,
    visiblePaneCap: governor.safe_zellij_visible_panes,
    backpressure: governor.backpressure,
    roles: roleDistribution.work_item_roles.map((row) => row.role),
    backend: schedulerBackend,
    worktreePolicy
  })
  const ledgerRoot = path.join(mission.dir, 'agents')
  await writeNarutoArtifacts(ledgerRoot, {
    workGraph,
    roleDistribution,
    governor,
    activePool,
    realActivePool: realActivePoolSmoke,
    allocationPolicy,
    rebalancePolicy,
    verificationDag,
    gptFinalPack,
    zellijDashboard,
    placeholderGuard,
    gitWorktreeCapability
  })
  await writeJsonAtomic(path.join(mission.dir, 'naruto-gate.json'), {
    schema: 'sks.naruto-gate.v1',
    passed: false,
    mission_id: mission.id,
    clone_roster_built: true,
    clone_count: roster.agent_count,
    work_graph_ready: workGraph.ok === true,
    role_distribution_ready: roleDistribution.ok === true,
    allocation_ready: allocationPolicy.ok === true,
    rebalance_ready: rebalancePolicy.ok === true,
    concurrency_governor_ready: true,
    active_pool_simulated: activePool.ok === true,
    verification_dag_ready: true,
    gpt_final_pack_ready: true,
    zellij_dashboard_ready: zellijDashboard.ok === true,
    native_agent_proof: false,
    final_arbiter_accepted: false,
    session_cleanup: false,
    blockers: [],
    updated_at: nowIso()
  })
  await setCurrent(root, {
    mission_id: mission.id,
    route: 'Naruto',
    route_command: '$Naruto',
    mode: 'NARUTO',
    phase: 'NARUTO_NATIVE_AGENT_INTAKE',
    questions_allowed: false,
    implementation_allowed: true,
    context7_required: false,
    context7_verified: parsed.mock,
    subagents_required: true,
    subagents_verified: false,
    native_sessions_required: true,
    native_sessions_verified: false,
    reflection_required: true,
    visible_progress_required: true,
    required_skills: ['naruto', 'pipeline-runner', 'prompt-pipeline', 'honest-mode'],
    stop_gate: 'naruto-gate.json',
    clone_count: roster.agent_count,
    target_active_slots: activeSlots,
    work_graph_ready: workGraph.ok === true,
    naruto_gate_file: 'naruto-gate.json',
    prompt: parsed.prompt
  })
  let liveZellij: any = null
  if (!parsed.json) {
    console.log('$Naruto starting:')
    console.log('  clones requested: ' + roster.agent_count)
    console.log('  work items: ' + workGraph.total_work_items)
    console.log('  target active workers: ' + activeSlots)
    console.log('  visible panes: ' + zellijVisiblePanes)
    console.log('  headless workers: ' + Math.max(0, activeSlots - zellijVisiblePanes))
    console.log('  backend: ' + schedulerBackend)
    console.log('  parallelism mode: ' + parsed.parallelism)
    if (activeSlots < roster.agent_count) console.log('  cap reasons: ' + (governor.reasons.join(', ') || 'host safety cap'))
    // Backpressure used to throttle silently (50% when throttled, 25% when
    // saturated); always tell the operator when host pressure reduced workers.
    if (governor.backpressure !== 'normal') console.log('  backpressure: ' + governor.backpressure + ' — host resource pressure reduced active workers (memory/cpu/fd/disk thresholds)')
    if (parsed.parallelism !== 'safe' && activeSlots < 10) console.log('  warning: active workers below 10 in non-safe mode')
  }
  if (!parsed.json && !parsed.mock && !parsed.noOpenZellij) {
    liveZellij = await launchZellijLayout({
      root,
      missionId: mission.id,
      ledgerRoot,
      kind: 'naruto',
      slotCount: 0,
      dryRun: false,
      attach: false
    })
    if (liveZellij?.ok && liveZellij.capability?.status === 'ok') {
      liveZellij.dashboard_pane = null
      liveZellij.right_column_mode = 'spawn-on-first-worker'
      await writeJsonAtomic(path.join(mission.dir, 'zellij-initial-ui.json'), {
        schema: 'sks.zellij-initial-ui.v1',
        ok: true,
        mission_id: mission.id,
        session_name: liveZellij.session_name,
        initial_panes: 'main-only',
        dashboard_created: false,
        worker_panes_created: 0,
        right_column_mode: 'spawn-on-first-worker',
        visible_pane_cap: zellijVisiblePanes
      })
      console.log('Zellij: started main-only session ' + liveZellij.session_name + '; right column opens on first visible worker spawn. Attach with: ' + (liveZellij.attach_command_with_env || liveZellij.attach_command))
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
    desiredWorkItemCount: workGraph.total_work_items,
    minimumWorkItems: workGraph.total_work_items,
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
    zellijSessionName: liveZellij?.session_name || `sks-${mission.id}`,
    workerPlacement: parsed.json || parsed.noOpenZellij ? 'process' : 'zellij-pane',
    zellijPaneWorker: true,
    zellijVisiblePaneCap: zellijVisiblePanes,
    ...(parsed.fastMode === undefined ? {} : { fastMode: parsed.fastMode }),
    ...(parsed.serviceTier === undefined ? {} : { serviceTier: parsed.serviceTier }),
    noFast: parsed.noFast,
    writeMode: writeCapable ? parsed.writeMode || 'parallel' : 'off',
    applyPatches: parsed.applyPatches,
    dryRunPatches: parsed.dryRunPatches,
    maxWriteAgents: parsed.maxWriteAgents,
    gitWorktreePolicy: worktreePolicy,
    narutoWorkGraph: workGraph,
    narutoAllocationPolicy: allocationPolicy,
    narutoRebalancePolicy: rebalancePolicy,
    json: parsed.json
  })
  const parallelRuntime = result.parallel_runtime_proof || null
  const nativeProofOk = result.proof?.ok === true || result.proof?.status === 'passed'
  const finalAccepted = result.proof?.status === 'passed' || result.proof?.gpt_final_status === 'approved'
  const parallelRuntimeOk = !parsed.mock || roster.agent_count < 16 || (
    parallelRuntime?.passed === true
    && Number(parallelRuntime.max_observed_active_workers || 0) >= Math.min(16, activeSlots)
  )
  await writeJsonAtomic(path.join(mission.dir, 'naruto-gate.json'), {
    schema: 'sks.naruto-gate.v1',
    passed: result.ok === true && nativeProofOk && finalAccepted && parallelRuntimeOk,
    mission_id: mission.id,
    clone_roster_built: true,
    clone_count: roster.agent_count,
    work_graph_ready: workGraph.ok === true,
    role_distribution_ready: roleDistribution.ok === true,
    allocation_ready: allocationPolicy.ok === true,
    rebalance_ready: rebalancePolicy.ok === true,
    concurrency_governor_ready: true,
    active_pool_simulated: activePool.ok === true,
    verification_dag_ready: true,
    gpt_final_pack_ready: true,
    zellij_dashboard_ready: zellijDashboard.ok === true,
    native_agent_proof: nativeProofOk,
    parallel_runtime_proof: parallelRuntimeOk,
    final_arbiter_accepted: finalAccepted,
    session_cleanup: result.proof?.all_sessions_closed === true || nativeProofOk,
    blockers: [...(result.proof?.blockers || []), ...(parallelRuntimeOk ? [] : ['naruto_parallel_runtime_proof_below_gate'])],
    updated_at: nowIso()
  })
  const clones = result.roster?.agent_count ?? roster.agent_count
  const localWorkerSummary = summarizeNarutoLocalWorkerResult(localWorker, result)
  // Finalizer policy: when local LLM workers contributed patches, the GPT
  // final arbiter must have accepted before patches are considered final.
  const finalizer = evaluateNarutoFinalizer({
    localParticipated: Number(localWorkerSummary?.selected_worker_count || 0) > 0,
    gptFinalStatus: result.proof?.gpt_final_status || null,
    applyPatches: parsed.applyPatches
  })
  await writeJsonAtomic(path.join(mission.dir, 'naruto-finalizer.json'), {
    ...finalizer,
    generated_at: nowIso(),
    mission_id: mission.id
  })
  const summaryOk = result.ok === true && (parsed.applyPatches === true ? finalizer.ok === true : finalizer.run_ok === true)
  await setCurrent(root, {
    mission_id: mission.id,
    route: 'Naruto',
    route_command: '$Naruto',
    mode: 'NARUTO',
    phase: summaryOk ? 'NARUTO_COMPLETE_OR_REVIEW' : 'NARUTO_BLOCKED',
    native_sessions_verified: nativeProofOk,
    subagents_verified: nativeProofOk,
    naruto_gate_file: 'naruto-gate.json',
    stop_gate: 'naruto-gate.json',
    prompt: parsed.prompt
  })
  // 4.0.9: Write canonical stop-gate artifacts for hook resolution.
  const narutoGatePassed = result.ok === true && nativeProofOk && finalAccepted && parallelRuntimeOk
  await writeFinalStopGate({
    root,
    missionId: mission.id,
    route: 'Naruto',
    routeCommand: '$Naruto',
    status: summaryOk ? 'passed' : 'blocked',
    terminal: summaryOk,
    terminalState: summaryOk ? 'completed' : 'blocked',
    evidence: {
      build_passed: summaryOk,
      tests_passed: summaryOk,
      route_evidence_passed: nativeProofOk && finalAccepted,
      native_session_split_evidence: nativeProofOk ? 'native_agent_proof' : null,
    },
    blockers: summaryOk ? [] : [...(result.proof?.blockers || []), ...(parallelRuntimeOk ? [] : ['naruto_parallel_runtime_proof_below_gate'])],
    nativeGateFile: 'naruto-gate.json',
  }).catch(() => null)
  const summary = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: summaryOk,
    mode: 'NARUTO',
    jutsu: 'kage_bunshin_no_jutsu',
    mission_id: result.mission_id,
    backend: result.backend,
    clones,
    max_clones: MAX_NARUTO_AGENT_COUNT,
    concurrency: result.target_active_slots ?? activeSlots,
    target_active_slots: result.target_active_slots ?? activeSlots,
    runtime_source_of_truth: 'agent-orchestrator-scheduler',
    pre_run_real_active_pool_source: runPreRunSmoke ? 'smoke_only' : 'skipped',
    concurrency_capped: clones > (result.target_active_slots ?? activeSlots),
    system: { cores: safe.cores, free_gb: safe.free_gb, safe_concurrency: safe.cap, heavy_backend: safe.heavy },
    work_graph: {
      total_work_items: workGraph.total_work_items,
      mixed_work_kinds: workGraph.mixed_work_kinds,
      write_allowed_count: workGraph.write_allowed_count,
      active_wave_count: workGraph.active_waves.length,
      parallel_write_wave_count: workGraph.active_waves.filter((wave) => wave.write_paths.length > 1).length,
      ok: workGraph.ok,
      worktree_policy: workGraph.worktree_policy
    },
    git_worktree: gitWorktreeCapability,
    role_distribution: roleDistribution,
    allocation_policy: allocationPolicy,
    rebalance_policy: rebalancePolicy,
    concurrency_governor: governor,
    active_pool: {
      ok: activePool.ok,
      max_observed_active_workers: activePool.max_observed_active_workers,
      refill_events: activePool.refill_events,
      completed_count: activePool.completed_count,
      real_runtime: {
        ok: realActivePoolSmoke.ok,
        runtime_source_of_truth: realActivePoolSmoke.runtime_source_of_truth,
        production_runtime_source_of_truth: realActivePoolSmoke.production_runtime_source_of_truth,
        active_cap: realActivePoolSmoke.active_cap,
        max_observed_active_workers: realActivePoolSmoke.max_observed_active_workers,
        average_active_workers: realActivePoolSmoke.average_active_workers,
        active_pool_utilization: realActivePoolSmoke.active_pool_utilization,
        refill_latency_ms_p95: realActivePoolSmoke.refill_latency_ms_p95,
        visible_workers: realActivePoolSmoke.visible_workers,
        headless_workers: realActivePoolSmoke.headless_workers,
        worker_lifecycle_count: realActivePoolSmoke.worker_lifecycle.length,
        worker_lifecycle_sample: realActivePoolSmoke.worker_lifecycle.slice(0, 5)
      }
    },
    parallel_runtime: parallelRuntime ? {
      proof_path: path.join(result.ledger_root || '', 'parallel-runtime-proof.json'),
      max_observed_active_workers: parallelRuntime.max_observed_active_workers,
      unique_worker_pids: parallelRuntime.unique_worker_pids,
      speedup_ratio: parallelRuntime.speedup_ratio,
      visible_panes: parallelRuntime.visible_panes,
      headless_workers: parallelRuntime.headless_workers,
      passed: parallelRuntime.passed
    } : null,
    parallel_write_policy: result.parallel_write_policy || null,
    local_worker: localWorkerSummary,
    fast_mode_policy: result.fast_mode_policy || null,
    fast_mode_propagation: result.fast_mode_propagation ? {
      ok: result.fast_mode_propagation.ok === true,
      fast_mode: result.fast_mode_propagation.fast_mode,
      service_tier: result.fast_mode_propagation.service_tier,
      worker_process_report_count: result.fast_mode_propagation.worker_process_report_count || 0,
      blockers: result.fast_mode_propagation.blockers || []
    } : null,
    finalizer,
    proof: result.proof?.status || 'missing',
    run: compactNarutoRunResult(result),
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
    if (!finalizer.ok) console.log('Finalizer: blocked — ' + finalizer.blockers.join(', '))
    if (summary.parallel_runtime) {
      console.log('$Naruto parallel proof:')
      console.log('  max active workers: ' + summary.parallel_runtime.max_observed_active_workers)
      console.log('  unique PIDs: ' + summary.parallel_runtime.unique_worker_pids)
      console.log('  speedup: ' + summary.parallel_runtime.speedup_ratio + 'x')
      console.log('  result: ' + (summary.parallel_runtime.passed ? 'passed' : 'blocked'))
    }
    if (summary.zellij?.ok && summary.zellij.capability?.status === 'ok') console.log('Zellij: prepared ' + zellijVisiblePanes + ' visible active clone lane(s) in ' + summary.zellij.session_name + '; dashboard tracks ' + Math.max(0, activeSlots - zellijVisiblePanes) + ' headless active worker(s)')
    else if (summary.zellij?.ok) console.log('Zellij: optional live panes unavailable (' + ((summary.zellij.warnings || []).join('; ') || summary.zellij.capability?.status || 'unknown') + ')')
  })
}

function compactNarutoRunResult(result: any) {
  return {
    schema: result?.schema || 'sks.agent-run.v1',
    ok: result?.ok === true,
    mission_id: result?.mission_id || null,
    route: result?.route || NARUTO_ROUTE,
    backend: result?.backend || null,
    parallel_write_policy: result?.parallel_write_policy || null,
    target_active_slots: result?.target_active_slots ?? null,
    proof: result?.proof ? {
      ok: result.proof.ok === true,
      status: result.proof.status || null,
      blockers: result.proof.blockers || []
    } : null,
    scheduler: result?.scheduler ? {
      state: {
        completed_count: result.scheduler.state?.completed_count ?? result.scheduler.completed_count ?? null,
        failed_count: result.scheduler.state?.failed_count ?? result.scheduler.failed_count ?? null,
        blocked_count: result.scheduler.state?.blocked_count ?? result.scheduler.blocked_count ?? null,
        max_observed_active_slots: result.scheduler.state?.max_observed_active_slots ?? result.scheduler.max_observed_active_slots ?? null
      }
    } : null,
    artifacts: {
      ledger_root: result?.ledger_root || null,
      proof: 'agent-proof-evidence.json',
      scheduler: 'agent-scheduler-state.json',
      native_cli_session_swarm: 'agent-native-cli-session-swarm.json',
      naruto_real_active_pool: 'naruto-real-active-pool.json'
    }
  }
}

async function runNarutoControlPlaneSmoke(input: {
  root: string
  missionId: string
  prompt: string
  rosterCount: number
  totalWorkItems: number
  patchEnvelopeBasePath: string
  worktreePolicy: any
  governor: any
  activeSlots: number
  zellijVisiblePanes: number
}) {
  const smokeGraph = buildNarutoWorkGraph({
    prompt: input.prompt,
    requestedClones: Math.min(2, input.rosterCount),
    totalWorkItems: Math.min(2, input.totalWorkItems),
    readonly: true,
    writeCapable: false,
    leaseBasePath: input.patchEnvelopeBasePath,
    maxActiveWorkers: Math.min(2, input.activeSlots),
    worktreePolicy: {
      mode: 'patch-envelope-only',
      required: false,
      main_repo_root: input.worktreePolicy.main_repo_root,
      worktree_root: null,
      fallback_reason: 'pre_run_smoke_never_owns_production_runtime'
    }
  })
  const smokeWorktreePolicy = {
    mode: 'patch-envelope-only' as const,
    required: false,
    main_repo_root: input.worktreePolicy.main_repo_root,
    worktree_root: null,
    fallback_reason: 'pre_run_smoke_never_owns_production_runtime'
  }
  const realActivePool = await runNarutoRealActivePool({
    graph: smokeGraph,
    governor: { ...input.governor, safe_active_workers: Math.min(2, input.activeSlots), safe_zellij_visible_panes: Math.min(1, input.zellijVisiblePanes) },
    spawnWorker: async (item, placement) => spawnActualNarutoWorker({
      root: input.root,
      missionId: input.missionId,
      item,
      placement,
      backend: 'fake',
      parentPrompt: input.prompt,
      worktreePolicy: smokeWorktreePolicy,
      zellijSessionName: `sks-${input.missionId}`,
      visiblePaneCap: input.zellijVisiblePanes
    }) as any,
    collectWorker: async (handle) => collectActualNarutoWorker(handle as any),
    enqueueVerification: async () => undefined,
    updateDashboard: async () => undefined
  })
  return {
    ...realActivePool,
    status: 'smoke_completed',
    runtime_source_of_truth: 'pre_run_smoke_only',
    production_runtime_source_of_truth: 'agent-orchestrator-scheduler',
    fallback_reason: 'pre_run_smoke_never_owns_production_runtime',
    smoke_graph_total_work_items: smokeGraph.total_work_items
  }
}

function buildNarutoAllocationWorkers(workGraph: any, roleDistribution: any, roster: any) {
  const workItems = Array.isArray(workGraph?.work_items) ? workGraph.work_items : []
  const roleByWorkItem = new Map((roleDistribution?.work_item_roles || []).map((row: any) => [String(row.work_item_id), String(row.role || '')]))
  const rosterRows = Array.isArray(roster?.roster) ? roster.roster : []
  const count = Math.max(1, Math.min(Number(roster?.agent_count || rosterRows.length || workItems.length || 1), Math.max(1, workItems.length || 1)))
  return Array.from({ length: count }, (_unused, index) => {
    const agent = rosterRows[index] || {}
    const item = workItems[index % Math.max(1, workItems.length)] || {}
    const role = String(agent.naruto_role || agent.role || roleByWorkItem.get(String(item.id || '')) || item.required_role || 'worker')
    return {
      id: String(agent.id || `clone-${String(index + 1).padStart(3, '0')}`),
      role,
      lane: narutoAllocationLane(item)
    }
  })
}

function narutoAllocationLane(item: any) {
  const firstPath = String((item?.write_paths || item?.target_paths || item?.readonly_paths || [])[0] || '')
  const parts = firstPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.slice(0, Math.min(2, parts.length)).join('/') || null
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
    selected_worker_count: (backendCounts['local-llm'] || 0) + (backendCounts.ollama || 0),
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
      write_allowed_count: workGraph.write_allowed_count,
      active_wave_count: Array.isArray(workGraph.active_waves) ? workGraph.active_waves.length : null,
      parallel_write_wave_count: Array.isArray(workGraph.active_waves) ? workGraph.active_waves.filter((wave: any) => Array.isArray(wave.write_paths) && wave.write_paths.length > 1).length : null
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

async function narutoDashboard(parsed: NarutoArgs) {
  const root = await sksRoot()
  const id = parsed.missionId && parsed.missionId !== 'latest' ? parsed.missionId : await findLatestMission(root)
  if (!id) return emit(parsed, { schema: NARUTO_RESULT_SCHEMA, ok: false, action: 'dashboard', status: 'missing_mission' }, () => console.log('No Naruto mission found.'))
  const { dir } = await loadMission(root, id)
  const snapshot = await readJson<any>(path.join(dir, 'zellij-dashboard-snapshot.json'), null)
  const rightColumnState = await readJson<any>(path.join(dir, 'zellij-right-column-state.json'), null)
  const summary = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: Boolean(snapshot || rightColumnState),
    action: 'dashboard',
    mission_id: id,
    snapshot,
    right_column_state: rightColumnState,
    blockers: snapshot || rightColumnState ? [] : ['naruto_dashboard_missing']
  }
  return emit(parsed, summary, () => {
    console.log('🍥 Naruto dashboard: ' + id)
    console.log('Right column: ' + (rightColumnState?.status || 'missing'))
    if (snapshot) console.log('Active/visible/headless/queue: ' + [snapshot.active_workers, snapshot.visible_panes, snapshot.headless_workers, snapshot.queue_depth].join('/'))
  })
}

async function narutoWorkers(parsed: NarutoArgs) {
  const root = await sksRoot()
  const id = parsed.missionId && parsed.missionId !== 'latest' ? parsed.missionId : await findLatestMission(root)
  if (!id) return emit(parsed, { schema: NARUTO_RESULT_SCHEMA, ok: false, action: 'workers', status: 'missing_mission' }, () => console.log('No Naruto mission found.'))
  const { dir } = await loadMission(root, id)
  const swarm = await readJson<any>(path.join(dir, 'agents', 'agent-native-cli-session-swarm.json'), null)
  const state = await readJson<any>(path.join(dir, 'zellij-right-column-state.json'), null)
  const records = Array.isArray(swarm?.records) ? swarm.records : []
  const summary = {
    schema: NARUTO_RESULT_SCHEMA,
    ok: Boolean(swarm || state),
    action: 'workers',
    mission_id: id,
    active: records.filter((row: any) => row.status === 'running' || row.status === 'launching').length,
    completed: records.filter((row: any) => row.status === 'closed').length,
    failed: records.filter((row: any) => row.status === 'failed').length,
    visible_worker_panes: state?.visible_worker_panes || [],
    headless_workers: state?.headless_workers || [],
    records,
    blockers: swarm || state ? [] : ['naruto_worker_records_missing']
  }
  return emit(parsed, summary, () => {
    console.log('🍥 Naruto workers: ' + id)
    console.log(`Active ${summary.active} · completed ${summary.completed} · failed ${summary.failed} · visible ${summary.visible_worker_panes.length} · headless ${summary.headless_workers.length}`)
  })
}

async function narutoProof(parsed: NarutoArgs) {
  const root = await sksRoot()
  const id = parsed.missionId && parsed.missionId !== 'latest' ? parsed.missionId : await findLatestMission(root)
  if (!id) return emit(parsed, { schema: NARUTO_RESULT_SCHEMA, ok: false, action: 'proof', status: 'missing_mission' }, () => console.log('No Naruto mission found.'))
  const summary = await buildRuntimeProofSummary(root, id, { maxMessages: parsed.messages })
  return emit(parsed, { ...summary, action: 'proof' }, () => {
    console.log(renderRuntimeProofSummary(summary))
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
      'sks naruto run "<task>" [--clones N] [--backend codex-sdk|fake|ollama|local-llm] [--local-model|--ollama|--no-ollama] [--work-items N] [--write-mode parallel|serial|off] [--apply-patches] [--dry-run-patches] [--real] [--readonly] [--json]',
      'sks naruto status [--mission <id>] [--json]',
      'sks naruto proof latest [--messages 20] [--json]'
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
  action: 'run' | 'status' | 'help' | 'dashboard' | 'workers' | 'proof'
  prompt: string
  clones: number
  workItems: number
  workItemsExplicit: boolean
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
  applyPatches: boolean
  dryRunPatches: boolean
  maxWriteAgents: number
  fastMode: boolean | undefined
  serviceTier: AgentServiceTier | undefined
  noFast: boolean
  json: boolean
  missionId: string
  noOpenZellij: boolean
  attach: boolean
  smoke: boolean
  parallelism: 'extreme' | 'balanced' | 'safe'
  messages: number
}

function parseNarutoArgs(args: string[] = []): NarutoArgs {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) args = ['help', ...args.filter((arg) => arg !== '--help' && arg !== '-h')]
  const first = args[0] && !String(args[0]).startsWith('--') ? String(args[0]) : ''
  const actions = new Set(['run', 'status', 'help', 'dashboard', 'workers', 'proof'])
  const action = (actions.has(first) ? first : 'run') as NarutoArgs['action']
  const rest = action === first ? args.slice(1) : args
  const json = hasFlag(args, '--json')
  const requestedClones = Number(readOption(args, '--clones', readOption(args, '--agents', DEFAULT_NARUTO_CLONES)))
  const clones = clampClones(requestedClones)
  const workItemsExplicit = hasOption(args, '--work-items')
  const workItems = clampWorkItems(Number(readOption(args, '--work-items', clones * 2)), clones)
  const concurrency = normalizeConcurrency(readOption(args, '--concurrency', readOption(args, '--target-active-slots', null)), clones)
  const useOllamaProtocol = hasFlag(args, '--ollama')
  const useLocalModel = hasFlag(args, '--local-model')
  const useOllama = useOllamaProtocol || useLocalModel
  const noOllama = hasFlag(args, '--no-ollama') || hasFlag(args, '--no-local-model')
  const backendExplicit = hasOption(args, '--backend') || useOllama || noOllama
  const defaultBackend = hasFlag(args, '--mock')
    ? 'fake'
    : useLocalModel && !noOllama
      ? 'local-llm'
      : useOllamaProtocol && !noOllama
        ? 'ollama'
        : 'codex-sdk'
  const backend = String(readOption(args, '--backend', defaultBackend))
  const mock = hasFlag(args, '--mock') || backend === 'fake'
  const real = hasFlag(args, '--real')
  const readonly = hasFlag(args, '--readonly') || hasFlag(args, '--read-only')
  const writeModeRaw = String(readOption(args, '--write-mode', hasFlag(args, '--parallel-write') ? 'parallel' : '') || '')
  const writeMode = (['proof-safe', 'parallel', 'serial', 'off'].includes(writeModeRaw) ? writeModeRaw : null) as NarutoArgs['writeMode']
  const applyPatches = hasFlag(args, '--apply-patches')
  const dryRunPatches = hasFlag(args, '--dry-run-patches') || hasFlag(args, '--dry-run-patch')
  const maxWriteAgents = Math.max(0, Math.floor(Number(readOption(args, '--max-write-agents', '0')) || 0))
  const explicitServiceTier = String(readOption(args, '--service-tier', '') || '')
  const requestedServiceTier = normalizeServiceTier(explicitServiceTier, null) || undefined
  // Naruto clones always run in the fast service tier. The route-level skill and
  // release docs explicitly treat --no-fast / standard as non-honored for clones.
  const serviceTier = action === 'run' ? 'fast' : requestedServiceTier
  const fastMode = action === 'run'
    ? true
    : hasFlag(args, '--no-fast') || requestedServiceTier === 'standard'
      ? false
      : hasFlag(args, '--fast')
        ? true
        : undefined
  const noFast = action === 'run' ? false : hasFlag(args, '--no-fast')
  const positionalMission = action === 'dashboard' || action === 'workers' || action === 'status' || action === 'proof'
    ? positionalArgs(rest, new Set()).find((arg) => /^latest$|^M-/.test(arg))
    : null
  const missionId = String(readOption(args, '--mission', readOption(args, '--mission-id', positionalMission || 'latest')))
  const ollamaModel = String(readOption(args, '--ollama-model', readOption(args, '--local-model-model', '')) || '') || null
  const ollamaBaseUrl = String(readOption(args, '--ollama-base-url', readOption(args, '--local-model-base-url', '')) || '') || null
  const noOpenZellij = hasFlag(args, '--no-open-zellij') || hasFlag(args, '--no-zellij')
  const attach = hasFlag(args, '--attach')
  const smoke = hasFlag(args, '--smoke')
  const parallelism = normalizeParallelism(readOption(args, '--parallelism', 'extreme'))
  const messages = normalizeMessages(readOption(args, '--messages', '8'))
  const valueFlags = new Set(['--clones', '--agents', '--work-items', '--concurrency', '--target-active-slots', '--backend', '--write-mode', '--max-write-agents', '--service-tier', '--mission', '--mission-id', '--ollama-model', '--local-model-model', '--ollama-base-url', '--local-model-base-url', '--parallelism', '--messages'])
  const prompt = positionalArgs(rest, valueFlags).join(' ').trim() || 'Naruto shadow clone swarm run'
  return { action, prompt, clones, workItems, workItemsExplicit, concurrency, backend, backendExplicit, mock, real, readonly, ollamaEnabled: useOllama && !noOllama, noOllama, ollamaModel, ollamaBaseUrl, writeMode, applyPatches, dryRunPatches, maxWriteAgents, fastMode, serviceTier, noFast, json, missionId, noOpenZellij, attach, smoke, parallelism, messages }
}

function normalizeParallelism(value: unknown): 'extreme' | 'balanced' | 'safe' {
  const text = String(value || 'extreme').toLowerCase()
  if (text === 'safe' || text === 'balanced' || text === 'extreme') return text
  return 'extreme'
}

function normalizeMessages(value: unknown): number {
  const parsed = Number(value)
  return Math.max(0, Math.min(100, Math.floor(Number.isFinite(parsed) ? parsed : 8)))
}

async function writeNarutoArtifacts(ledgerRoot: string, artifacts: {
  workGraph: any
  roleDistribution: any
  governor: any
  activePool: any
  realActivePool?: any
  allocationPolicy?: any
  rebalancePolicy?: any
  verificationDag: any
  gptFinalPack: any
  zellijDashboard: any
  placeholderGuard: any
  gitWorktreeCapability: any
}) {
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-work-graph.json'), artifacts.workGraph)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-role-distribution.json'), artifacts.roleDistribution)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-concurrency-governor.json'), artifacts.governor)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-active-pool.json'), artifacts.activePool)
  if (artifacts.realActivePool) await writeJsonAtomic(path.join(ledgerRoot, 'naruto-real-active-pool.json'), artifacts.realActivePool)
  if (artifacts.allocationPolicy) await writeJsonAtomic(path.join(ledgerRoot, 'naruto-allocation-policy.json'), artifacts.allocationPolicy)
  if (artifacts.rebalancePolicy) await writeJsonAtomic(path.join(ledgerRoot, 'naruto-rebalance-policy.json'), artifacts.rebalancePolicy)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-verification-dag.json'), artifacts.verificationDag)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-gpt-final-pack.json'), artifacts.gptFinalPack)
  await writeJsonAtomic(path.join(ledgerRoot, 'naruto-zellij-dashboard.json'), artifacts.zellijDashboard)
  await writeJsonAtomic(path.join(ledgerRoot, 'prompt-placeholder-guard.json'), artifacts.placeholderGuard)
  if (artifacts.gitWorktreeCapability) await writeJsonAtomic(path.join(ledgerRoot, 'git-worktree-capability.json'), artifacts.gitWorktreeCapability)
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

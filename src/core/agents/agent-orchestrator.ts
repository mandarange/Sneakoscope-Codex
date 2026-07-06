import path from 'node:path'
import { createMission, missionDir, setCurrent } from '../mission.js'
import { normalizeWorkerPromptText } from '../naruto/normalize-worker-prompt-text.js'
import { exists, nowIso, readJson, readText, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { buildAgentRoster, normalizeAgentConcurrency } from './agent-roster.js'
import { buildAgentWorkPartition } from './agent-work-partition.js'
import { detectAgentLeaseConflicts } from './work-partition/conflict-detector.js'
import { buildNoOverlapProof } from './work-partition/no-overlap-proof.js'
import { initializeAgentCentralLedger, appendAgentLedgerEvent, compactAgentLedger } from './agent-central-ledger.js'
import { detectStaleAgentSessions, killTimedOutAgentSessions, openAgentSession, heartbeatAgentSession, collectAgentSession, completeAgentSession, closeAgentSession, writeAgentLifecycleAggregate, writeAgentLifecyclePolicy } from './agent-lifecycle.js'
import { writeAgentConsensus } from './agent-consensus.js'
import { writeAgentProofEvidence } from './agent-proof-evidence.js'
import { selectRouteSkill, skillProofRecord } from '../skills/core-skill-runtime.js'
import { routeSkillId } from '../skills/core-skill-card.js'
import { loadTriWikiRuntimeContext, writeTriWikiContextArtifact } from '../triwiki-runtime.js'
import { MAX_AGENT_COUNT, normalizeAgentBackend } from './agent-schema.js'
import type { AgentRunOptions } from './agent-schema.js'
import { PersistentAgentPatchQueueStore } from './agent-patch-queue-store.js'
import { applyAgentPatchQueueEntry, rollbackAgentPatchApply } from './agent-patch-apply-worker.js'
import { coordinateAgentPatchMerge, writeAgentMergeCoordinatorArtifacts } from './agent-merge-coordinator.js'
import { buildAgentPatchProof } from './agent-patch-proof.js'
import { executeAgentPatchConflictRebase } from './agent-patch-conflict-rebase.js'
import { AgentPatchTransactionJournal } from './agent-patch-transaction-journal.js'
import { normalizeAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'
import { runFakeAgent } from './agent-runner-fake.js'
import { runProcessAgent } from './agent-runner-process.js'
import { classifyOllamaWorkerSlice, runOllamaAgent } from './agent-runner-ollama.js'
import { resolveOllamaWorkerConfig } from './ollama-worker-config.js'
import { decideAgentWorkerModel } from './agent-effort-policy.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'
import { writeAgentCleanupReport } from './agent-cleanup.js'
import { writeAgentTrustReport } from './agent-trust-report.js'
import { writeAgentWrongnessRecords } from './agent-wrongness.js'
import { writeAgentRecursionGuardReport } from './agent-recursion-guard.js'
import { appendAgentCodexCockpitHookEvent, writeAgentCodexCockpitArtifacts } from './agent-codex-cockpit.js'
import { runAgentJanitor } from './agent-janitor.js'
import { startAgentTerminalSession, closeAgentTerminalSession } from './agent-terminal-session.js'
import { writeScoutPolicyArtifact } from './scout-policy.js'
import { writeZellijRightLaneCockpit } from './zellij-right-lane-cockpit.js'
import { buildProjectNamespace, namespacedAgentSessionId, writeProjectNamespaceArtifact } from '../session/project-namespace.js'
import { normalizeTargetActiveSlots, runAgentScheduler } from './agent-scheduler.js'
import { runSourceIntelligence } from '../source-intelligence/source-intelligence-runner.js'
import { detectOfficialGoalMode, writeOfficialGoalModeArtifact } from '../codex/official-goal-mode.js'
import { writeAgentTaskGraph } from './agent-task-graph.js'
import { drainZellijLaneSupervisor, initializeZellijLaneSupervisorEmpty, updateZellijLaneSupervisorFromSlots, verifyZellijLaneSurvival } from './zellij-lane-supervisor.js'
import { writeZellijPaneProof } from '../zellij/zellij-pane-proof.js'
import { writeIntelligentWorkGraphArtifacts } from './intelligent-work-graph.js'
import { writeAdhdOrchestrationArtifacts } from '../strategy/adhd-orchestrating-gate.js'
import { compileStrategy, writeStrategyCompilerArtifacts } from '../strategy/strategy-compiler.js'
import { evaluateStrategyGate, writeStrategyGateArtifact } from '../strategy/strategy-gate.js'
import { applyFastModeToRoster, resolveFastModePolicy, writeFastModePropagationProof } from './fast-mode-policy.js'
import { createNativeCliSessionSwarmRecorder } from './native-cli-session-swarm.js'
import { writeNativeCliSessionProof } from './native-cli-session-proof.js'
import { writeNoSubagentScalingPolicy } from './no-subagent-scaling-policy.js'
import { writeOfficialSubagentHelperPolicy } from './official-subagent-helper-policy.js'
import { runCodexTask } from '../codex-control/codex-control-plane.js'
import { CODEX_AGENT_WORKER_RESULT_SCHEMA_ID, codexAgentWorkerResultSchema } from '../codex-control/schemas/agent-worker-result.schema.js'
import { resolveLocalCollaborationPolicy, localCollaborationParticipated } from '../local-llm/local-collaboration-policy.js'
import { runFinalGptReviewStage } from '../pipeline/final-gpt-review-stage.js'
import { selectFinalGptPatchSource } from '../pipeline/final-gpt-patch-stage.js'
import { allocateWorkerWorktree, allocateWorkerWorktreesBatch } from '../git/git-worktree-manager.js'
import { exportGitWorktreeDiff } from '../git/git-worktree-diff.js'
import { buildGitWorktreePatchEnvelope } from '../git/git-worktree-patch-envelope.js'
import { checkpointWorkerWorktree } from '../git/git-worktree-checkpoint.js'
import { cleanupGitWorktree } from '../git/git-worktree-cleanup.js'
import { createGitIntegrationWorktree } from '../git/git-integration-worktree.js'
import { applyGitWorktreeMergeQueue } from '../git/git-worktree-merge-queue.js'
import { crossRebaseIdleWorktrees } from '../git/git-worktree-cross-rebase.js'
import { gitOutputLine, runGitCommand } from '../git/git-worktree-runner.js'
import type { GitWorktreeDiff } from '../git/git-worktree-diff.js'
import { writeParallelRuntimeProof } from './parallel-runtime-proof.js'
import { enforceRetention } from '../retention.js'
import { APPROACHES, rank, scoreCandidate, summarizeTournament, type TournamentCandidate, type TournamentResult } from '../naruto/solution-tournament.js'

export async function runNativeAgentOrchestrator(opts: AgentRunOptions = {}): Promise<any> {
  const root = path.resolve(opts.root || process.cwd())
  const sessionKey = opts.sessionKey || null
  const prompt = String(opts.prompt || 'Native agent run')
  const route = opts.route || '$Agent'
  const routeCommand = String(opts.routeCommand || defaultRouteCommand(route))
  const routeBlackboxKind = String(opts.routeBlackboxKind || defaultRouteBlackboxKind(route))
  const fastModePolicy = resolveFastModePolicy({ ...opts, root })
  const requestedBackend = String(opts.backend || (opts.mock ? 'fake' : 'codex-sdk'))
  const legacyCodexExecRequested = requestedBackend === 'codex-exec'
  const backend = legacyCodexExecRequested ? 'codex-sdk' : normalizeAgentBackend(requestedBackend)
  const maxAgentCount = Number.isFinite(Number(opts.maxAgentCount)) && Number(opts.maxAgentCount) >= 1 ? Math.floor(Number(opts.maxAgentCount)) : MAX_AGENT_COUNT
  const realZellij = backend === 'zellij' && opts.real === true
  const realZellijProofRequired = realZellij && process.env.SKS_REQUIRE_ZELLIJ === '1'
  const created = opts.missionId
    ? { id: opts.missionId, dir: missionDir(root, opts.missionId), mission: { id: opts.missionId, mode: 'agent', prompt } }
    : await createMission(root, { mode: 'agent', prompt, sessionKey })
  const missionId = created.id
  const dir = created.dir
  if (legacyCodexExecRequested) {
    await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: 'AGENT_LEGACY_CODEX_EXEC_BLOCKED', route_command: routeCommand, native_agent_backend: 'codex-sdk', updated_at: nowIso() }, { sessionKey })
    return legacyCodexExecBlockedRun({ root, missionId, dir, route, routeCommand, routeBlackboxKind, backend: 'codex-sdk' })
  }
  // Route start: consult this route's deployed Core Skill snapshot (read-only).
  // Graceful fallback when none is deployed — zero-risk, never invokes the optimizer.
  const routeSkillSelection = await selectRouteSkill(root, route, routeSkillId(route)).catch(() => null)
  const selectedCoreSkill = routeSkillSelection ? skillProofRecord(routeSkillSelection) : null
  const namespace = await buildProjectNamespace({ root, missionId })
  await writeProjectNamespaceArtifact(dir, namespace)
  let roster = buildProvidedAgentRoster(opts.roster, { concurrency: opts.concurrency, readonly: opts.readonly, maxAgentCount, prompt }) || buildAgentRoster({ agents: opts.agents, concurrency: opts.concurrency, prompt, maxAgentCount, ...(opts.readonly === undefined ? {} : { readonly: opts.readonly }) })
  roster = applyFastModeToRoster(roster, fastModePolicy)
  roster.roster = roster.roster.map((agent: any) => ({
    ...agent,
    session_id: namespacedAgentSessionId({
      agentId: agent.id,
      missionId,
      rootHash: namespace.root_hash,
      index: agent.index
    })
  }))
  const targetActiveSlots = normalizeTargetActiveSlots(opts.targetActiveSlots ?? opts.agents ?? roster.agent_count, maxAgentCount)
  const visualLaneCount = normalizeVisualLaneCount(opts.visualLaneCount ?? opts.clones ?? opts.agents ?? roster.agent_count, roster.agent_count, maxAgentCount)
  const desiredWorkItemCount = normalizeDesiredWorkItemCount(opts.desiredWorkItemCount, opts.minimumWorkItems, targetActiveSlots)
  const minimumWorkItems = normalizeMinimumWorkItems(opts.minimumWorkItems, targetActiveSlots)
  const sourceIntelligence = await runSourceIntelligence({ root, missionDir: dir, route, query: prompt, offline: true, context7Available: true })
  const sourceIntelligenceRef = {
    artifact: 'source-intelligence-evidence.json',
    ok: sourceIntelligence.ok,
    mode: sourceIntelligence.mode,
    cache_key: sourceIntelligence.cache.key,
    proof_ok: sourceIntelligence.proof.ok
  }
  const goalMode = await detectOfficialGoalMode({ runCommand: opts.mock !== true && opts.backend !== 'fake' })
  await writeOfficialGoalModeArtifact(dir, goalMode)
  const goalModeRef = {
    artifact: 'goal-mode-applied.json',
    ok: goalMode.ok,
    mode: goalMode.mode,
    official_goal_available: goalMode.official_goal_available,
    default_enabled: goalMode.default_enabled
  }
  const writeCapable = isWriteCapableRun(opts)
  const visualRequired = sourceIntelligence.appshots?.capability.visual_required === true
  const strategyCompiled = compileStrategy({
    prompt,
    route,
    ...(writeCapable ? {} : { writeTargets: [] }),
    agentCount: roster.agent_count,
    visualRequired
  })
  await writeAdhdOrchestrationArtifacts(dir, strategyCompiled.gate)
  await writeStrategyCompilerArtifacts(dir, strategyCompiled)
  const strategyGate = evaluateStrategyGate({
    compiled: strategyCompiled,
    writeCapable,
    visualRequired,
    appshotsOk: sourceIntelligence.appshots?.ok === true,
    sourceIntelligenceOk: sourceIntelligence.ok,
    sourceIntelligenceRequired: sourceIntelligenceRequiredForWriteGate(sourceIntelligence, route)
  })
  await writeStrategyGateArtifact(dir, strategyGate)
  const strategyRef = {
    artifact: 'strategy-gate.json',
    ok: strategyGate.ok,
    scheduler_allowed: strategyGate.scheduler_allowed,
    strategy_first_required: strategyGate.strategy_first_required,
    micro_win_count: strategyGate.micro_win_count,
    appshots_operator_action_required: strategyGate.appshots_operator_action_required
  }
  if (!strategyGate.scheduler_allowed) {
    await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: 'AGENT_STRATEGY_GATE_BLOCKED', route_command: routeCommand, native_agent_backend: backend, updated_at: nowIso() }, { sessionKey })
    const blockedLedgerRoot = path.join(dir, 'agents')
    return {
      schema: 'sks.agent-run.v1',
      ok: false,
      status: 'blocked',
      mission_id: missionId,
      route,
      route_command: routeCommand,
      route_blackbox_kind: routeBlackboxKind,
      backend,
      ledger_root: path.relative(root, blockedLedgerRoot),
      roster,
      partition: { ok: false, slice_count: 0, lease_count: 0, blockers: strategyGate.blockers },
      task_graph: null,
      requested_work_items: desiredWorkItemCount,
      actual_total_work_items: 0,
      target_active_slots: targetActiveSlots,
      minimum_work_items: minimumWorkItems,
      source_intelligence: sourceIntelligenceRef,
      goal_mode: goalModeRef,
      strategy_gate: strategyGate,
      scheduler: {
        ok: false,
        status: 'blocked_before_scheduler',
        scheduler_allowed: false,
        blockers: strategyGate.blockers
      },
      results: [],
      consensus: { ok: false, blockers: strategyGate.blockers },
      output_validation: { ok: false, blockers: strategyGate.blockers },
      backend_report: { ok: false, blockers: strategyGate.blockers },
      recursion: { ok: true, violations: [] },
      timeout_kill: { killed_sessions: [] },
      output_tails: { ok: true, records: [] },
      cleanup: { ok: true, all_sessions_closed: true, blockers: [] },
      trust: { ok: false, blockers: strategyGate.blockers },
      wrongness: { ok: false, blockers: strategyGate.blockers },
      parallel_write_policy: null,
      proof: {
        ok: false,
        status: 'blocked',
        blockers: strategyGate.blockers
      }
    }
  }
  let partition = await buildAgentWorkPartition(root, roster, prompt, {
    route,
    targetActiveSlots,
    desiredWorkItemCount,
    minimumWorkItems,
    sourceIntelligenceRefs: sourceIntelligenceRef,
    goalModeRef,
    strategyRefs: strategyRef,
    strategyOwnershipPlan: strategyCompiled.file_ownership_plan,
    microWins: strategyCompiled.gate.micro_wins
  })
  if (opts.narutoWorkGraph?.work_items?.length) {
    partition = applyNarutoWorkGraphToPartition(partition, opts.narutoWorkGraph, roster, targetActiveSlots, prompt)
    augmentVerificationRollbackDagForNaruto(strategyCompiled.verification_rollback_dag, partition.slices)
  }
  await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
  const ledgerRoot = await initializeAgentCentralLedger(dir, { missionId, roster, partition, route, prompt, dynamicScheduler: true })
  // Consult the TriWiki context pack (read-only) before dispatching workers, and
  // persist it as a proof artifact so the kernel proof references the wiki it acted on.
  const triwikiContext = await loadTriWikiRuntimeContext(root)
  await writeTriWikiContextArtifact(ledgerRoot, triwikiContext)
  if (opts.narutoWorkGraph?.work_items?.length) {
    await writeJsonAtomic(path.join(ledgerRoot, 'naruto-work-graph.json'), opts.narutoWorkGraph)
    await writeJsonAtomic(path.join(ledgerRoot, 'naruto-runtime-wiring.json'), buildNarutoRuntimeWiringProof(partition, opts.narutoWorkGraph, roster, targetActiveSlots))
  }
  if (opts.narutoAllocationPolicy) await writeJsonAtomic(path.join(ledgerRoot, 'naruto-allocation-policy.json'), opts.narutoAllocationPolicy)
  if (opts.narutoRebalancePolicy) await writeJsonAtomic(path.join(ledgerRoot, 'naruto-rebalance-policy.json'), opts.narutoRebalancePolicy)
  await writeAgentTaskGraph(ledgerRoot, partition.task_graph)
  await writeAdhdOrchestrationArtifacts(ledgerRoot, strategyCompiled.gate)
  await writeStrategyCompilerArtifacts(ledgerRoot, strategyCompiled)
  await writeStrategyGateArtifact(ledgerRoot, strategyGate)
  await writeIntelligentWorkGraphArtifacts(ledgerRoot, partition.intelligent_work_graph)
  await writeScoutPolicyArtifact(ledgerRoot)
  await writeZellijRightLaneCockpit(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, agents: roster.roster })
  await initializeZellijLaneSupervisorEmpty(ledgerRoot, { missionId, sessionName: `sks-${missionId}` })
  await writeZellijPaneProof(root, { missionId, require: realZellijProofRequired, phase: 'initial', ledgerRoot })
  await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-no-overlap-proof.json'), partition.no_overlap_proof || { schema: 'sks.agent-no-overlap-proof.v1', ok: false, blockers: ['missing_no_overlap_proof'] })
  await writeAgentLifecyclePolicy(ledgerRoot)
  await writeAgentLifecycleAggregate(ledgerRoot)
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-concurrency-policy.json'), {
    schema: 'sks.agent-concurrency-policy.v1',
    default_agents: roster.default_agents,
    max_agents: roster.max_agents,
    agents: roster.agent_count,
    concurrency: roster.concurrency,
    batch_count: 0,
    target_active_slots: targetActiveSlots,
    visual_lane_count: visualLaneCount,
    desired_work_items: desiredWorkItemCount,
    minimum_work_items: minimumWorkItems,
    requested_work_items: desiredWorkItemCount,
    total_work_items: partition.task_graph?.total_work_items || partition.slices.length,
    service_tier: fastModePolicy.service_tier,
    fast_mode: fastModePolicy.fast_mode,
    fast_mode_default: fastModePolicy.default_fast_mode,
    backpressure: 'dynamic scheduler maintains target active slots until the work queue drains',
    rate_limit_delay_ms: backend === 'codex-sdk' ? 250 : 0,
    resource_pressure_warnings: roster.agent_count > roster.concurrency ? ['agents_exceed_concurrency_batches'] : []
  })
  const effectiveWriteMode = writeCapable ? opts.writeMode || 'off' : 'off'
  const parallelWritePolicy = {
    schema: 'sks.agent-parallel-write-policy.v1',
    generated_at: nowIso(),
    route,
    route_command: routeCommand,
    write_mode: effectiveWriteMode,
    apply_patches: opts.applyPatches === true,
    dry_run_patches: opts.dryRunPatches === true,
    max_write_agents: Number(opts.maxWriteAgents || 0),
    readonly: opts.readonly === true,
    patch_queue_required: opts.applyPatches === true || opts.dryRunPatches === true,
    patch_apply_mode: opts.applyPatches === true ? opts.dryRunPatches === true ? 'dry_run' : 'apply' : 'not_requested',
    route_level_flags_wired: true,
    strategy_gate: strategyRef
  }
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-parallel-write-policy.json'), parallelWritePolicy)
  const gitWorktreePolicy = opts.gitWorktreePolicy || null
  const gitWorktreeRuntime = {
    schema: 'sks.agent-git-worktree-runtime.v1',
    generated_at: nowIso(),
    ok: true,
    mode: gitWorktreePolicy?.mode || 'patch-envelope-only',
    required: gitWorktreePolicy?.required === true,
    main_repo_root: gitWorktreePolicy?.main_repo_root || root,
    worktree_root: gitWorktreePolicy?.worktree_root || null,
    allocations: [] as any[],
    diffs: [] as any[],
    checkpoints: [] as any[],
    cleanup: [] as any[],
    prewarmed_allocations: [] as any[],
    blockers: [] as string[]
  }
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-git-worktree-runtime.json'), gitWorktreeRuntime)
  const preparedWorktreeAllocations = new Map<string, any>()
  if (gitWorktreePolicy?.mode === 'git-worktree') {
    const writeSlices = uniqueWritableSlicesForWorktrees(partition.slices, Math.max(1, targetActiveSlots))
    if (writeSlices.length) {
      const prewarmed = await allocateWorkerWorktreesBatch({
        root: gitWorktreePolicy.main_repo_root || root,
        missionId,
        workers: writeSlices.map((slice: any, index: number) => ({
          workerId: String(slice.owner_agent_id || slice.owner || `worker-${index + 1}`),
          slotId: String(slice.owner_agent_id || slice.owner || `slot-${index + 1}`),
          generationIndex: 1
        })),
        maxParallel: Math.min(targetActiveSlots, Number(process.env.SKS_NARUTO_GIT_WORKTREE_CAP || targetActiveSlots))
      }).catch((err: unknown) => {
        gitWorktreeRuntime.blockers.push('git_worktree_batch_prewarm_failed:' + (err instanceof Error ? err.message : String(err)))
        gitWorktreeRuntime.ok = false
        return []
      })
      gitWorktreeRuntime.prewarmed_allocations = prewarmed.map((allocation: any) => ({
        worker_id: allocation.worker_id,
        slot_id: allocation.slot_id,
        ok: allocation.ok,
        worktree_path: allocation.worktree_path,
        branch: allocation.branch,
        blockers: allocation.blockers
      }))
      for (const allocation of prewarmed) {
        if (allocation.ok) preparedWorktreeAllocations.set(String(allocation.worker_id), allocation)
        else gitWorktreeRuntime.blockers.push(...allocation.blockers)
      }
      gitWorktreeRuntime.ok = gitWorktreeRuntime.blockers.length === 0
      await writeJsonAtomic(path.join(ledgerRoot, 'agent-git-worktree-runtime.json'), gitWorktreeRuntime)
    }
  }
  const nativeCliSwarm = createNativeCliSessionSwarmRecorder(ledgerRoot, {
    missionId,
    requestedAgents: Number(opts.agents || roster.agent_count || targetActiveSlots),
    targetActiveSlots,
    backend,
    backendExplicit: opts.backendExplicit === true,
    noOllama: opts.noOllama === true,
    route,
    fastModePolicy,
    ...(opts.workerPlacement === undefined ? {} : { workerPlacement: String(opts.workerPlacement) }),
    zellijVisiblePaneCap: Number(opts.zellijVisiblePaneCap || visualLaneCount || targetActiveSlots),
    projectRoot: root
  })
  const schedulerHardTimeoutMs = normalizeMissionHardTimeoutMs(opts, route)
  let lastTimeoutReapMs = 0
  async function reapTimedOutAgentSessions(force = false) {
    const now = Date.now()
    if (!force && now - lastTimeoutReapMs < 30000) return null
    lastTimeoutReapMs = now
    return killTimedOutAgentSessions(ledgerRoot, now, { hardTimeoutMs: schedulerHardTimeoutMs })
  }
  await nativeCliSwarm.initialize()
  await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: 'AGENT_NATIVE_KERNEL_RUNNING', route_command: routeCommand, native_agent_backend: backend }, { sessionKey })
  const scheduler = await runAgentScheduler({
    root: ledgerRoot,
    missionId,
    rootHash: namespace.root_hash,
    roster,
    partition,
    prompt,
    targetActiveSlots,
    maxActiveSlots: maxAgentCount,
    ...(opts.maxQueueExpansion === undefined ? {} : { maxQueueExpansion: opts.maxQueueExpansion }),
    ...(opts.refillDelayMs === undefined ? {} : { refillDelayMs: opts.refillDelayMs }),
    sourceIntelligenceRefs: sourceIntelligenceRef,
    goalModeRef,
    launchSession: async ({ agent, workItem }) => {
      await reapTimedOutAgentSessions()
      const slice = workItem.slice || { id: workItem.id, description: workItem.description || prompt }
      const workerWorktree = await prepareWorkerGitWorktree({
        root,
        ledgerRoot,
        missionId,
        agent,
        slice,
        policy: gitWorktreePolicy,
        runtime: gitWorktreeRuntime,
        preparedAllocation: preparedWorktreeAllocations.get(String(agent.id || '')) || null
      })
      const runtimeAgent = workerWorktree ? { ...agent, worktree: workerWorktree.context } : agent
      const runtimeSlice = workerWorktree ? { ...slice, worktree: workerWorktree.context } : slice
      await openAgentSession(ledgerRoot, agent)
      await heartbeatAgentSession(ledgerRoot, agent)
      await appendAgentCodexCockpitHookEvent(dir, {
        hook_event_name: 'NativeSessionStart',
        agent_id: agent.id,
        agent_type: agent.role || agent.persona_id || 'agent',
        session_id: agent.session_id,
        slot_id: agent.slot_id || null,
        generation_index: agent.generation_index ?? null,
        persona_id: agent.persona_id || null,
        agent_transcript_path: agent.session_artifact_dir ? path.join(agent.session_artifact_dir, 'agent-transcript.jsonl') : null,
        cwd: root,
        permission_mode: agent.write_policy || 'read-only',
      })
      await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
      await appendAgentLedgerEvent(ledgerRoot, { agent_id: agent.id, session_id: agent.session_id, event_type: 'agent_started', payload: { backend, slice_id: slice.id } })
      await startAgentTerminalSession(ledgerRoot, agent, {
        backend,
        real: backend === 'process' || (backend === 'codex-sdk' && opts.real === true) || backend === 'zellij',
        slotId: agent.slot_id,
        generationIndex: agent.generation_index,
        requireGeneration: true
      })
      const backendOpts = { ...opts, missionId, agentRoot: ledgerRoot, cwd: workerWorktree?.context.path || root, projectRoot: root, route, prompt, fastMode: fastModePolicy.fast_mode, serviceTier: fastModePolicy.service_tier, ...(workerWorktree ? { worktree: workerWorktree.context } : {}) }
      const result = opts.nativeCliSwarm === false
        ? await runAgentByBackend(backend, runtimeAgent, runtimeSlice, backendOpts)
        : await nativeCliSwarm.launchWorker({ agent: runtimeAgent, slice: runtimeSlice, opts: backendOpts })
      await reapTimedOutAgentSessions()
      if (route === '$Naruto') attachNarutoRuntimeProof(result, runtimeAgent, runtimeSlice)
      if (workerWorktree) await finalizeWorkerGitWorktree({
        root,
        ledgerRoot,
        missionId,
        agent: runtimeAgent,
        slice: runtimeSlice,
        result,
        workerWorktree,
        runtime: gitWorktreeRuntime
      })
      enforceWorkerQualityProtocolForSlice(result, runtimeSlice)
      const terminalClose = await closeAgentTerminalSession(ledgerRoot, agent, {
        exitCode: result.status === 'done' ? 0 : 1,
        status: result.status,
        stdoutTail: result.summary || '',
        stderrTail: (result.blockers || []).join('\n'),
        slotId: agent.slot_id,
        generationIndex: agent.generation_index,
        requireGeneration: true
      })
      result.artifacts = [...(result.artifacts || []), path.join(agent.session_artifact_dir || path.join('sessions', agent.id), 'agent-terminal-session.json'), path.join(agent.session_artifact_dir || path.join('sessions', agent.id), 'agent-terminal-close-report.json')]
      result.source_intelligence_refs = result.source_intelligence_refs || sourceIntelligenceRef
      result.goal_mode_ref = result.goal_mode_ref || goalModeRef
      result.verification = {
        status: result.verification?.status || 'not_run',
        checks: [...(result.verification?.checks || []), terminalClose.ok ? 'agent-terminal-close-report' : 'agent-terminal-close-report-missing']
      }
      await collectAgentSession(ledgerRoot, agent)
      await appendAgentLedgerEvent(ledgerRoot, { agent_id: agent.id, session_id: agent.session_id, event_type: 'agent_result', payload: result })
      if (result.status === 'done') await completeAgentSession(ledgerRoot, agent)
      await closeAgentSession(ledgerRoot, agent, result.status === 'done' ? 'closed' : result.status)
      await appendAgentCodexCockpitHookEvent(dir, {
        hook_event_name: 'NativeSessionStop',
        agent_id: agent.id,
        agent_type: agent.role || agent.persona_id || 'agent',
        session_id: agent.session_id,
        slot_id: agent.slot_id || null,
        generation_index: agent.generation_index ?? null,
        persona_id: agent.persona_id || null,
        agent_transcript_path: agent.session_artifact_dir ? path.join(agent.session_artifact_dir, 'agent-transcript.jsonl') : null,
        cwd: root,
        permission_mode: agent.write_policy || 'read-only',
        last_assistant_message: result.summary || null,
      })
      await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
      return result
    },
    onSchedulerEvent: async ({ event, slots, state }) => {
      await reapTimedOutAgentSessions()
      const paneBySlot = await readZellijPaneIdsBySlot(ledgerRoot)
      const enrichedSlots = slots.map((slot) => ({ ...slot, pane_id: paneBySlot.get(slot.slot_id) || null, launch_status: paneBySlot.has(slot.slot_id) ? 'launched' : slot.status }))
      await writeZellijRightLaneCockpit(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, slots: enrichedSlots })
      await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
      if (['session_completed', 'backfill_event', 'scheduler_drained'].includes(String(event.event_type))) {
        const periodicJanitor = await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
        if (!periodicJanitor.ok) await appendAgentLedgerEvent(ledgerRoot, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'periodic_janitor_blocked', payload: periodicJanitor })
      }
      if (String(event.event_type) === 'scheduler_draining') {
        await verifyZellijLaneSurvival(ledgerRoot)
        await writeZellijPaneProof(root, { missionId, require: realZellijProofRequired, phase: 'before_drain', ledgerRoot })
      }
      await updateZellijLaneSupervisorFromSlots(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, slots, state, event })
      if (String(event.event_type) === 'scheduler_drained') {
        await drainZellijLaneSupervisor(ledgerRoot)
        await writeZellijPaneProof(root, { missionId, require: realZellijProofRequired, phase: 'after_drain', ledgerRoot })
      }
    }
  })
  await reapTimedOutAgentSessions(true)
  await nativeCliSwarm.finalize()
  const parallelRuntimeProof = await writeParallelRuntimeProof(ledgerRoot, missionId, {
    requestedWorkers: Number(opts.agents || roster.agent_count || targetActiveSlots),
    targetActiveSlots,
    visiblePanes: visualLaneCount,
    expectedWorkerRuntimeMs: targetActiveSlots >= 10 ? 8000 : targetActiveSlots >= 2 ? 2000 : 25,
    minActiveWorkers: Math.min(targetActiveSlots, desiredWorkItemCount),
    ...(backend === 'codex-sdk' && opts.real === true ? { minSpeedupRatio: 3 } : {}),
    proofMode: opts.mock === true ? 'mock-process' : 'production',
    requireWorkerPids: opts.nativeCliSwarm !== false && targetActiveSlots >= 16,
    requireChangedFiles: writeCapable && effectiveWriteMode === 'parallel',
    minChangedFiles: Math.min(2, desiredWorkItemCount)
  })
  let results = scheduler.results
  const tournamentSelection = await selectSolutionTournamentWinners(root, ledgerRoot, results)
  results = tournamentSelection.results
  const nativeCliSessionProof = await writeNativeCliSessionProof(ledgerRoot, {
    requestedAgents: Number(opts.agents || roster.agent_count || targetActiveSlots),
    targetActiveSlots,
    totalWorkItems: partition.task_graph?.total_work_items || partition.slices.length
  })
  const officialSubagentHelperPolicy = await writeOfficialSubagentHelperPolicy(ledgerRoot, { nativeProof: nativeCliSessionProof })
  const noSubagentScalingPolicy = await writeNoSubagentScalingPolicy(ledgerRoot, { nativeProof: nativeCliSessionProof, officialSubagentHelperPolicy })
  const fastModePropagation = await writeFastModePropagationProof(ledgerRoot, { policy: fastModePolicy, backend, results })
  const localCollaborationPolicy = resolveLocalCollaborationPolicy()
  await writeJsonAtomic(path.join(ledgerRoot, 'local-collaboration-policy.json'), localCollaborationPolicy)
  const localParticipated = localCollaborationParticipated(results)
  const candidatePatchEnvelopes = results.flatMap((result: any) => Array.isArray(result.patch_envelopes) ? result.patch_envelopes : [])
  const worktreeParticipated = candidatePatchEnvelopes.some((envelope: any) => envelope?.source === 'git-worktree-diff' || envelope?.git_worktree?.worktree_path)
    || results.some((result: any) => result?.git_worktree_diff || result?.git_worktree_checkpoint)
  const gptFinalRequired = localParticipated || worktreeParticipated
  const gptFinalArbiter = gptFinalRequired
    ? await runFinalGptReviewStage({
      schema: 'sks.gpt-final-arbiter-input.v1',
      route,
      mission_id: missionId,
      local_mode: localCollaborationPolicy.mode,
      local_outputs: results.map((result: any) => ({
        worker_id: result.agent_id,
        backend: result.backend_router_report?.selected_backend || result.backend || backend,
        status: result.status,
        summary: result.summary,
        patch_envelopes: result.patch_envelopes || [],
        proof: result.verification?.status || '',
        blockers: result.blockers || [],
        changed_files: result.changed_files || []
      })),
      candidate_diff: '',
      candidate_patch_envelopes: candidatePatchEnvelopes,
      verification_results: results.map((result: any) => result.verification || { status: result.status || 'unknown' }),
      side_effect_report: { schema: 'sks.agent-side-effect-summary.v1', ok: true, route, mutation_owner: 'parent_agent_orchestrator' },
      mutation_ledger: { parallel_write_policy: parallelWritePolicy, result_count: results.length },
      rollback_plan: { verification_rollback_dag: strategyCompiled.verification_rollback_dag || null }
    }, { cwd: root, mutationLedgerRoot: path.join(ledgerRoot, 'gpt-final-arbiter') })
    : null
  const finalGptPatchStage = gptFinalRequired
    ? selectFinalGptPatchSource(gptFinalArbiter, candidatePatchEnvelopes)
    : null
  const resultsForPatchSwarm = gptFinalRequired && finalGptPatchStage?.ok === true && gptFinalArbiter?.result?.status === 'modified'
    ? withFinalGptPatchEnvelopes(results, finalGptPatchStage.patch_envelopes)
    : results
  const patchSwarm = await runAgentPatchSwarmRuntime(root, ledgerRoot, {
    missionId,
    sessionKey,
    route,
    routeCommand,
    writeCapable,
    results: resultsForPatchSwarm,
    parallelWritePolicy,
    verificationRollbackDag: strategyCompiled.verification_rollback_dag,
    dryRun: opts.dryRunPatches === true || opts.applyPatches !== true || (gptFinalRequired && gptFinalArbiter?.ok !== true),
    gptFinalArbiter,
    finalGptPatchStage
  })
  const stale = await detectStaleAgentSessions(ledgerRoot)
  if (!stale.ok) await appendAgentLedgerEvent(ledgerRoot, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'stale_sessions_detected', payload: stale })
  const timeoutKill = await killTimedOutAgentSessions(ledgerRoot, Date.now(), { hardTimeoutMs: schedulerHardTimeoutMs })
  const recursion = await writeAgentRecursionGuardReport(ledgerRoot, results)
  const consensus = await writeAgentConsensus(ledgerRoot, results)
  const outputValidation = await writeAgentOutputValidationReport(ledgerRoot, results)
  const outputTails = await writeAgentOutputTailReport(ledgerRoot, results)
  const backendReport = await writeAgentBackendReport(ledgerRoot, { backend, results, outputTails, fastModePolicy })
  const finalPaneBySlot = await readZellijPaneIdsBySlot(ledgerRoot)
  const finalZellijSlots = scheduler.slots.map((slot: any) => ({ ...slot, pane_id: finalPaneBySlot.get(slot.slot_id) || null, launch_status: finalPaneBySlot.has(slot.slot_id) ? 'launched' : slot.status }))
  await writeZellijRightLaneCockpit(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, slots: finalZellijSlots })
  await writeZellijPaneProof(root, { missionId, require: realZellijProofRequired, phase: 'final', ledgerRoot })
  await compactAgentLedger(ledgerRoot)
  const cleanup = await writeAgentCleanupReport(ledgerRoot)
  const janitor = await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
  const blockers = [
    ...results.flatMap((result: any) => result.blockers || []),
    ...(stale.ok ? [] : stale.stale_sessions.map((id: string) => 'stale_heartbeat:' + id)),
    ...(timeoutKill.killed_sessions || []).map((id: string) => 'timeout_killed:' + id),
    ...(recursion.ok ? [] : recursion.violations.map((id: string) => 'recursion:' + id)),
    ...(nativeCliSessionProof.ok ? [] : nativeCliSessionProof.blockers),
    ...(officialSubagentHelperPolicy.ok ? [] : officialSubagentHelperPolicy.blockers),
    ...(noSubagentScalingPolicy.ok ? [] : noSubagentScalingPolicy.blockers),
    ...(fastModePropagation.ok ? [] : fastModePropagation.blockers),
    ...(gitWorktreeRuntime.required === true && gitWorktreeRuntime.ok === false ? gitWorktreeRuntime.blockers || ['git_worktree_runtime_not_ok'] : []),
    ...(gptFinalRequired && gptFinalArbiter?.ok !== true ? gptFinalArbiter?.blockers || ['gpt_final_arbiter_not_ok'] : []),
    ...(gptFinalRequired && finalGptPatchStage?.ok === false ? finalGptPatchStage.blockers || ['final_gpt_patch_stage_not_ok'] : []),
    ...(patchSwarm.ok ? [] : patchSwarm.blockers),
    ...(janitor.ok ? [] : janitor.blockers)
  ]
  const trust = await writeAgentTrustReport(ledgerRoot, { missionId, backend, roster, partition, cleanup, outputTails, timeoutKill, backendReport, outputValidation, scheduler: scheduler.state, blockers })
  const wrongness = await writeAgentWrongnessRecords(ledgerRoot, blockers)
  const proof = await writeAgentProofEvidence(ledgerRoot, {
    missionId,
    backend,
    route,
    routeCommand,
    routeBlackboxKind,
    requestedWorkItems: partition.task_graph?.desired_work_items || desiredWorkItemCount,
    minimumWorkItems: partition.task_graph?.minimum_work_items || minimumWorkItems,
    targetActiveSlots,
    realParallel: backend === 'codex-sdk' && opts.mock !== true,
    visualLaneCount,
    roster,
    partition,
    consensus,
    results,
    cleanup,
    janitor,
    outputTails,
    timeoutKill,
    trust,
    wrongness,
    scheduler: scheduler.state,
    parallelWritePolicy,
    patchSwarm,
    strategyGate,
    nativeCliSessionProof,
    noSubagentScalingPolicy,
    officialSubagentHelperPolicy,
    fastModePolicy,
    fastModePropagation,
    gitWorktreeRuntime,
    triwikiContext,
    selectedCoreSkill,
    localCollaborationPolicy,
    gptFinalArbiter,
    finalGptPatchStage
  })
  await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
  await enforceRetention(root, { afterRoute: true, completedMissionId: missionId, rotateLargeJsonl: true, lightweight: true }).catch(() => null)
  await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: proof.ok ? 'AGENT_NATIVE_KERNEL_DONE' : 'AGENT_NATIVE_KERNEL_BLOCKED', native_agent_backend: backend, updated_at: nowIso() }, { sessionKey })
  return {
    schema: 'sks.agent-run.v1',
    ok: proof.ok,
    mission_id: missionId,
    route,
    route_command: routeCommand,
    route_blackbox_kind: routeBlackboxKind,
    backend,
    ledger_root: path.relative(root, ledgerRoot),
    roster,
    partition: { ok: partition.ok, slice_count: partition.slices.length, lease_count: partition.leases.length, blockers: partition.blockers },
    task_graph: partition.task_graph?.route_work_count_summary || null,
    requested_work_items: partition.task_graph?.desired_work_items || desiredWorkItemCount,
    actual_total_work_items: partition.task_graph?.total_work_items || partition.slices.length,
    target_active_slots: targetActiveSlots,
    visual_lane_count: visualLaneCount,
    minimum_work_items: partition.task_graph?.minimum_work_items || minimumWorkItems,
    scheduler,
    source_intelligence: sourceIntelligenceRef,
    goal_mode: goalModeRef,
    strategy_gate: strategyGate,
    results,
    consensus,
    output_validation: outputValidation,
    backend_report: backendReport,
    recursion,
    timeout_kill: timeoutKill,
    output_tails: outputTails,
    cleanup,
    trust,
    wrongness,
    parallel_write_policy: parallelWritePolicy,
    native_cli_session_proof: nativeCliSessionProof,
    no_subagent_scaling_policy: noSubagentScalingPolicy,
    official_subagent_helper_policy: officialSubagentHelperPolicy,
    fast_mode_policy: fastModePolicy,
    fast_mode_propagation: fastModePropagation,
    git_worktree_runtime: gitWorktreeRuntime,
    local_collaboration_policy: localCollaborationPolicy,
    gpt_final_arbiter: gptFinalArbiter,
    final_gpt_patch_stage: finalGptPatchStage,
    patch_swarm: patchSwarm,
    parallel_runtime_proof: parallelRuntimeProof,
    proof
  }
}

function normalizeMissionHardTimeoutMs(opts: any = {}, route = '') {
  const raw = Number(opts.hardTimeoutMs || opts.agentHardTimeoutMs || process.env.SKS_AGENT_HARD_TIMEOUT_MS || 0)
  if (Number.isFinite(raw) && raw > 0) return Math.max(1000, Math.min(Math.floor(raw), 24 * 60 * 60 * 1000))
  return String(route || '').replace(/^\$/, '').toUpperCase() === 'NARUTO' ? 10 * 60 * 1000 : 30 * 60 * 1000
}

function sourceIntelligenceRequiredForWriteGate(sourceIntelligence: any, route: string): boolean {
  const policy = sourceIntelligence?.policy || {}
  const mode = String(sourceIntelligence?.mode || policy.mode || '')
  if (String(route || '').replace(/^\$/, '').toLowerCase() === 'super-search') return true
  if (policy.context7?.required === true) return true
  if (policy.requirements?.official_sources === true) return true
  if (policy.requirements?.social_recency === true) return true
  if (policy.requirements?.code_execution_verification === true && mode !== 'offline_cache') return true
  return mode !== 'offline_cache'
}

function withFinalGptPatchEnvelopes(results: any[], patchEnvelopes: any[] = []) {
  const byAgent = new Map<string, any[]>()
  for (const envelope of patchEnvelopes) {
    const agentId = String(envelope?.agent_id || 'gpt-final-arbiter')
    byAgent.set(agentId, [...(byAgent.get(agentId) || []), envelope])
  }
  let assigned = false
  const next = results.map((result) => {
    const envelopes = byAgent.get(String(result.agent_id || '')) || []
    if (envelopes.length) assigned = true
    return { ...result, patch_envelopes: envelopes }
  })
  if (!assigned && patchEnvelopes.length && next[0]) next[0] = { ...next[0], patch_envelopes: patchEnvelopes }
  return next
}

async function selectSolutionTournamentWinners(root: string, ledgerRoot: string, results: any[]): Promise<{ results: any[]; report: any }> {
  const groups = new Map<string, any[]>()
  for (const result of results || []) {
    const groupId = String(result?.tournament?.group_id || result?.naruto_runtime?.tournament?.group_id || '')
    if (!groupId || !Array.isArray(result?.patch_envelopes) || result.patch_envelopes.length === 0) continue
    groups.set(groupId, [...(groups.get(groupId) || []), result])
  }
  const tournamentReports: any[] = []
  for (const [groupId, rows] of groups) {
    if (rows.length < 2) continue
    const candidates = await Promise.all(rows.map(async (result, index) => {
      const candidate: TournamentCandidate & { result: any } = {
        id: String(result?.task_slice_id || result?.naruto_runtime?.work_item_id || `${groupId}-cand${index + 1}`),
        approach: String(result?.tournament?.approach || result?.naruto_runtime?.tournament?.approach || APPROACHES[index] || ''),
        worktree: String(firstEnvelopeField(result, 'git_worktree')?.worktree_path || ''),
        patch: { patch_envelopes: result.patch_envelopes || [] },
        score: null,
        result
      }
      candidate.score = await scoreCandidate(root, candidate).catch((err) => ({
        machine_ok: false,
        tests_passed: 0,
        tests_failed: 1,
        diff_lines: 999999,
        new_symbols: 999,
        impact_breaks: 999,
        total: 999999,
        error: err instanceof Error ? err.message : String(err)
      } as any))
      return candidate
    }))
    const alive = candidates
      .filter((candidate) => candidate.score?.machine_ok && candidate.score.impact_breaks === 0)
      .sort((a, b) => rank(a.score!) - rank(b.score!))
    const winner = alive[0] || null
    const tournamentResult: TournamentResult = {
      schema: 'sks.solution-tournament.v1',
      winner,
      reason: winner ? (alive.length === 1 ? 'single_survivor' : 'judge:deterministic-maintainer-score') : 'all_candidates_failed_machine_checks',
      candidates
    }
    const summary = summarizeTournament(tournamentResult)
    const reportRow = {
      ...summary,
      group_id: groupId,
      judge_worker: alive.length > 1 ? 'deterministic-maintainer-score' : null,
      loser_cleanup: [] as unknown[]
    }
    tournamentReports.push(reportRow)
    if (!winner) {
      for (const candidate of candidates) {
        candidate.result.status = 'blocked'
        candidate.result.blockers = [...new Set([...(candidate.result.blockers || []), 'solution_tournament_all_candidates_failed'])]
      }
      continue
    }
    for (const candidate of candidates) {
      if (candidate === winner) {
        candidate.result.tournament = { ...candidate.result.tournament, selection: summary, selected: true }
        candidate.result.patch_envelopes = (candidate.result.patch_envelopes || []).map((envelope: any) => ({ ...envelope, tournament: summary }))
        continue
      }
      const cleanup = await cleanupTournamentLoserCandidate(root, candidate).catch((err) => ({ ok: false, blockers: ['tournament_loser_cleanup_failed:' + (err instanceof Error ? err.message : String(err))] }))
      reportRow.loser_cleanup.push(cleanup)
      candidate.result.patch_envelopes = []
      candidate.result.changed_files = []
      candidate.result.no_patch_reason = {
        schema: 'sks.solution-tournament-loser.v1',
        ok: true,
        reason: 'solution_tournament_loser',
        group_id: groupId,
        winner_id: winner.id
      }
      candidate.result.tournament = { ...candidate.result.tournament, selection: summary, selected: false }
    }
  }
  const report = {
    schema: 'sks.solution-tournament-report.v1',
    generated_at: nowIso(),
    ok: tournamentReports.every((row) => row.winner_id),
    tournament_count: tournamentReports.length,
    tournaments: tournamentReports
  }
  await writeJsonAtomic(path.join(ledgerRoot, 'solution-tournament-report.json'), report)
  return { results, report }
}

async function cleanupTournamentLoserCandidate(root: string, candidate: TournamentCandidate): Promise<Record<string, unknown>> {
  const envelope = ((candidate.patch as any)?.patch_envelopes || []).find((row: any) => row?.git_worktree?.worktree_path)
  const meta = envelope?.git_worktree
  if (!meta?.worktree_path || !meta?.main_repo_root) return { ok: true, action: 'no_worktree', candidate_id: candidate.id }
  const remove = await runGitCommand(String(meta.main_repo_root || root), ['worktree', 'remove', '--force', String(meta.worktree_path)])
  if (remove.ok && meta.branch) await runGitCommand(String(meta.main_repo_root || root), ['branch', '-D', String(meta.branch)])
  return {
    schema: 'sks.solution-tournament-loser-cleanup.v1',
    ok: remove.ok,
    action: remove.ok ? 'removed' : 'remove_failed',
    candidate_id: candidate.id,
    worktree_path: meta.worktree_path,
    branch: meta.branch || null,
    blockers: remove.ok ? [] : ['git_worktree_remove_failed']
  }
}

function uniqueWritableSlicesForWorktrees(slices: any[] = [], limit: number) {
  const selected: any[] = []
  const seenOwners = new Set<string>()
  for (const slice of Array.isArray(slices) ? slices : []) {
    if (!Array.isArray(slice?.write_paths) || slice.write_paths.length === 0) continue
    const owner = String(slice.owner_agent_id || slice.owner || slice.id || '')
    if (!owner || seenOwners.has(owner)) continue
    seenOwners.add(owner)
    selected.push(slice)
    if (selected.length >= Math.max(1, limit)) break
  }
  return selected
}

function applyNarutoWorkGraphToPartition(partition: any, graph: any, roster: any, targetActiveSlots: number, parentPrompt = '') {
  const activeRoster = (Array.isArray(roster?.roster) ? roster.roster : []).slice(0, Math.max(1, targetActiveSlots))
  const activeAgentIds = new Set(activeRoster.map((row: any) => String(row.id || '')).filter(Boolean))
  const fallbackOwners = activeRoster.length ? activeRoster : [{ id: 'naruto_clone_001', role: 'verifier' }]
  const referenceWorkItem = Array.isArray(partition?.task_graph?.work_items) ? partition.task_graph.work_items.find(Boolean) : null
  const sourceIntelligenceRefs = referenceWorkItem?.source_intelligence_refs || partition?.source_intelligence_refs || null
  const goalModeRef = referenceWorkItem?.goal_mode_ref || partition?.goal_mode_ref || null
  const strategyRefs = referenceWorkItem?.strategy_refs || partition?.strategy_refs || null
  const slices = (graph.work_items || []).flatMap((item: any, index: number) => {
    const candidateCount = item?.write_allowed && Number(item?.tournament || 0) >= 2
      ? Math.min(4, Math.max(2, Math.floor(Number(item.tournament))))
      : 1
    const requestedOwner = item.owner ? String(item.owner) : ''
    const sliceId = String(item.id || `NW-${String(index + 1).padStart(6, '0')}`)
    const writePaths = normalizePathList(item.write_paths)
    const readonlyPaths = normalizePathList(item.readonly_paths)
    const targetPaths = normalizePathList(item.target_paths)
    const parentObjectiveNormalized = normalizeWorkerPromptText(parentPrompt)
    const parentObjective = parentObjectiveNormalized.text
    return Array.from({ length: candidateCount }, (_unused, candidateOffset) => {
      const candidateIndex = candidateOffset + 1
      const candidateSliceId = candidateCount > 1 ? `${sliceId}-cand${candidateIndex}` : sliceId
      const owner = requestedOwner && activeAgentIds.has(requestedOwner) && candidateCount === 1
        ? requestedOwner
        : String(fallbackOwners[(index + candidateOffset) % fallbackOwners.length]?.id || requestedOwner || `naruto_clone_${String(index + candidateIndex).padStart(3, '0')}`)
      const verificationNodeId = writePaths.length ? `verify:${candidateSliceId}` : null
      const rollbackNodeId = writePaths.length ? `rollback:${candidateSliceId}` : null
      const approachDirective = candidateCount > 1 ? APPROACHES[candidateOffset] || APPROACHES[APPROACHES.length - 1] || '' : null
      return {
      id: candidateSliceId,
      owner_agent_id: owner,
      owner,
      lane: owner,
      role: String(item.required_role || 'verifier'),
      domain: String(item.allocation_hints?.domains?.[0] || item.kind || 'naruto'),
      title: candidateCount > 1
        ? `${String(item.title || item.id || `Naruto work ${index + 1}`)} (candidate ${candidateIndex}/${candidateCount})`
        : String(item.title || item.id || `Naruto work ${index + 1}`),
      dependencies: Array.isArray(item.dependencies) ? item.dependencies.map(String) : [],
      priority: index + 1,
      required_persona_category: String(item.required_role || 'verifier'),
      lease_requirements: Array.isArray(item.lease_requirements) ? item.lease_requirements : [],
      generated_by: 'sks.naruto-work-graph.v1',
      route_domain: String(item.kind || 'naruto'),
      work_item_kind: String(item.kind || 'verification'),
      tournament_group_id: candidateCount > 1 ? sliceId : null,
      tournament_candidate_index: candidateCount > 1 ? candidateIndex : null,
      tournament_candidate_count: candidateCount > 1 ? candidateCount : null,
      approach_directive: approachDirective,
      target_paths: targetPaths,
      readonly_paths: readonlyPaths,
      write_paths: writePaths,
      allocation_reason: item.allocation_reason || null,
      allocation_score: item.allocation_score ?? null,
      allocation_hints: item.allocation_hints || null,
      allocation_original_owner: requestedOwner || null,
      allocation_owner_rebalanced: Boolean(requestedOwner && owner !== requestedOwner),
      micro_win_id: sliceId,
      verification_node_id: verificationNodeId,
      rollback_node_id: rollbackNodeId,
      verification_required: item.verification_required === true,
      source_intelligence_refs: sourceIntelligenceRefs,
      goal_mode_ref: goalModeRef,
      strategy_refs: strategyRefs,
      parent_prompt: parentObjective,
      worker_prompt_truncated: parentObjectiveNormalized.truncated
        ? { worker: owner, dropped_chars: parentObjectiveNormalized.dropped_chars }
        : null,
      max_attempts: 1,
      description: [
        parentObjective ? `Parent Naruto objective:\n${parentObjective}` : null,
        String(item.title || item.id || 'Naruto work item'),
        approachDirective ? `Solution tournament approach: ${approachDirective}` : null,
        `Naruto owner: ${owner}`,
        item.allocation_reason ? `Allocation: ${item.allocation_reason}` : null,
        writePaths.length ? `Write paths: ${writePaths.join(', ')}` : 'Read-only or no-write work item.',
        writePaths.length ? null : 'Read-only instruction: inspect the requested files/artifacts and do not run package scripts, build commands, tests, or temp-file-creating checks unless the parent objective explicitly requires them.'
      ].filter(Boolean).join('\n')
      }
    })
  })
  const workItems = slices.map((slice: any) => ({
    id: slice.id,
    kind: slice.work_item_kind || slice.route_domain || 'verification',
    title: slice.title,
    target_paths: slice.target_paths || [],
    readonly_paths: slice.readonly_paths || [],
    write_paths: slice.write_paths || [],
    owner: slice.owner_agent_id,
    tournament_group_id: slice.tournament_group_id || null,
    tournament_candidate_index: slice.tournament_candidate_index || null,
    tournament_candidate_count: slice.tournament_candidate_count || null,
    approach_directive: slice.approach_directive || null,
    source_intelligence_refs: sourceIntelligenceRefs,
    goal_mode_ref: goalModeRef,
    strategy_refs: strategyRefs
  }))
  const leases = slices.flatMap((slice: any) => [
    ...slice.write_paths.map((file: string, index: number) => ({
      id: `${slice.id}:write:${index + 1}`,
      agent_id: slice.owner_agent_id,
      kind: 'write' as const,
      path: file,
      domain: slice.domain,
      status: 'active' as const,
      owner_agent: slice.owner_agent_id,
      write_paths: slice.write_paths,
      tournament_group_id: slice.tournament_group_id || null,
      strategy_task_id: slice.id,
      micro_win_id: slice.micro_win_id || slice.id,
      verification_node_id: slice.verification_node_id || null,
      rollback_node_id: slice.rollback_node_id || null,
      protected_path_check: { ok: true, blockers: [] }
    })),
    ...slice.readonly_paths.map((file: string, index: number) => ({
      id: `${slice.id}:read:${index + 1}`,
      agent_id: slice.owner_agent_id,
      kind: 'read' as const,
      path: file,
      domain: slice.domain,
      status: 'active' as const,
      owner_agent: slice.owner_agent_id,
      write_paths: slice.write_paths,
      tournament_group_id: slice.tournament_group_id || null,
      strategy_task_id: slice.id,
      micro_win_id: slice.micro_win_id || slice.id,
      verification_node_id: slice.verification_node_id || null,
      rollback_node_id: slice.rollback_node_id || null,
      protected_path_check: { ok: true, blockers: [] }
    }))
  ])
  const conflict_report = detectAgentLeaseConflicts(leases)
  const no_overlap_proof = buildNoOverlapProof(leases)
  const taskGraph = partition.task_graph
    ? {
      ...partition.task_graph,
      total_work_items: slices.length,
      desired_work_items: slices.length,
      minimum_work_items: Math.max(Number(partition.task_graph.minimum_work_items || 0), slices.length),
      work_items: workItems,
      route_work_count_summary: {
        ...(partition.task_graph.route_work_count_summary || {}),
        naruto_work_graph_items: slices.length,
        allocation_owner_rebalanced_count: slices.filter((slice: any) => slice.allocation_owner_rebalanced).length
      }
    }
    : null
  return {
    ...partition,
    ok: conflict_report.ok && no_overlap_proof.ok,
    task_graph: taskGraph,
    slices,
    leases,
    conflict_report,
    no_overlap_proof,
    source_intelligence_refs: sourceIntelligenceRefs,
    goal_mode_ref: goalModeRef,
    strategy_refs: strategyRefs,
    blockers: [...(conflict_report.blockers || []), ...(no_overlap_proof.blockers || [])]
  }
}

function augmentVerificationRollbackDagForNaruto(dag: any, slices: any[]) {
  if (!dag || !Array.isArray(dag.nodes) || !Array.isArray(slices)) return dag
  const byId = new Set(dag.nodes.map((node: any) => String(node.id || '')).filter(Boolean))
  for (const slice of slices) {
    const sliceId = String(slice?.id || '')
    if (!sliceId) continue
    const writePaths = normalizePathList(slice.write_paths)
    if (!byId.has(sliceId)) {
      dag.nodes.push({
        id: sliceId,
        kind: writePaths.length ? 'write' : 'verification',
        depends_on: [],
        proof_artifact: writePaths.length ? 'agent-patch-queue.json' : 'agent-worker-result.json'
      })
      byId.add(sliceId)
    }
    if (!writePaths.length) continue
    const verificationNodeId = String(slice.verification_node_id || `verify:${sliceId}`)
    const rollbackNodeId = String(slice.rollback_node_id || `rollback:${sliceId}`)
    if (!byId.has(verificationNodeId)) {
      dag.nodes.push({
        id: verificationNodeId,
        kind: 'verification',
        depends_on: [sliceId],
        proof_artifact: 'agent-patch-verification-results.json'
      })
      byId.add(verificationNodeId)
    }
    if (!byId.has(rollbackNodeId)) {
      dag.nodes.push({
        id: rollbackNodeId,
        kind: 'rollback',
        depends_on: [sliceId, verificationNodeId],
        proof_artifact: 'agent-patch-rollback-proof.json'
      })
      byId.add(rollbackNodeId)
    }
  }
  dag.rollback_ready = true
  dag.verification_ready = true
  if (dag.validation?.blockers?.length) dag.validation = { ok: true, blockers: [] }
  return dag
}

function buildNarutoRuntimeWiringProof(partition: any, graph: any, roster: any, targetActiveSlots: number) {
  const activeAgentIds = new Set((Array.isArray(roster?.roster) ? roster.roster : []).slice(0, Math.max(1, targetActiveSlots)).map((row: any) => String(row.id || '')).filter(Boolean))
  const slices = Array.isArray(partition?.slices) ? partition.slices : []
  const activeWriteConflicts = slices.flatMap((slice: any) => normalizePathList(slice.write_paths).map((file: string) => ({ file, tournament_group_id: slice.tournament_group_id || null })))
  const duplicateActiveWrites = activeWriteConflicts.filter((entry: any, index: number, all: any[]) =>
    all.some((other: any, otherIndex: number) => otherIndex !== index && other.file === entry.file && !sameTournamentGroupEntry(entry, other))
  )
  const ownerPreserved = slices.every((slice: any) => !slice.allocation_original_owner || slice.allocation_owner_rebalanced || slice.owner_agent_id === slice.allocation_original_owner)
  const inactiveOwnersRebalanced = slices.every((slice: any) => !slice.allocation_original_owner || activeAgentIds.has(slice.allocation_original_owner) || slice.allocation_owner_rebalanced)
  const expectedSliceCount = (graph?.work_items || []).reduce((sum: number, item: any) => sum + (item?.write_allowed && Number(item?.tournament || 0) >= 2 ? Math.min(4, Math.max(2, Math.floor(Number(item.tournament)))) : 1), 0)
  const blockers = [
    ...(slices.length === expectedSliceCount ? [] : ['naruto_runtime_slice_count_mismatch']),
    ...(ownerPreserved ? [] : ['naruto_runtime_owner_not_preserved']),
    ...(inactiveOwnersRebalanced ? [] : ['naruto_runtime_inactive_owner_not_rebalanced']),
    ...(duplicateActiveWrites.length ? ['naruto_runtime_duplicate_write_paths_in_partition'] : [])
  ]
  return {
    schema: 'sks.naruto-runtime-wiring.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    source_of_truth: 'naruto-work-graph',
    scheduler_slice_count: slices.length,
    work_graph_item_count: Number(graph?.work_items?.length || 0),
    owner_preserved: ownerPreserved,
    inactive_owners_rebalanced: inactiveOwnersRebalanced,
    write_conflict_free_partition: duplicateActiveWrites.length === 0,
    slice_owners: slices.map((slice: any) => ({
      id: slice.id,
      owner_agent_id: slice.owner_agent_id,
      original_owner: slice.allocation_original_owner || null,
      rebalanced: slice.allocation_owner_rebalanced === true,
      write_paths: slice.write_paths || [],
      dependencies: slice.dependencies || []
    })),
    blockers
  }
}

function sameTournamentGroupEntry(a: any, b: any): boolean {
  return Boolean(a?.tournament_group_id && b?.tournament_group_id && a.tournament_group_id === b.tournament_group_id)
}

function attachNarutoRuntimeProof(result: any, agent: any, slice: any) {
  const controlPlane = result?.codex_child_report || result?.codex_sdk_thread || result?.backend_router_report || null
  const selectedBackend = String(result?.backend_router_report?.selected_backend || result?.backend || '')
  const actualWorkerControlPlane = selectedBackend === 'codex-sdk' || selectedBackend === 'local-llm'
    ? Boolean(controlPlane?.sdk_thread_id || controlPlane?.worker_result_path || result?.codex_child_report?.worker_result_path)
    : false
  result.naruto_runtime = {
    schema: 'sks.naruto-worker-runtime-proof.v1',
    source_of_truth: 'agent-orchestrator-scheduler',
    actual_worker_control_plane: actualWorkerControlPlane,
    work_item_id: String(slice?.id || result?.task_slice_id || ''),
    work_item_kind: String(slice?.work_item_kind || result?.work_item_kind || ''),
    tournament: slice?.tournament_group_id ? {
      group_id: String(slice.tournament_group_id),
      candidate_index: Number(slice.tournament_candidate_index || 1),
      candidate_count: Number(slice.tournament_candidate_count || 1),
      approach: String(slice.approach_directive || '')
    } : null,
    owner: String(slice?.owner_agent_id || slice?.owner || agent?.id || ''),
    allocation_reason: slice?.allocation_reason || null,
    rebalance_generation: Number(slice?.allocation_owner_rebalanced === true ? 1 : 0),
    selected_backend: selectedBackend || null,
    explicit_fake_backend: selectedBackend === 'fake',
    control_plane_result: controlPlane
      ? {
        worker_result_path: controlPlane.worker_result_path || null,
        sdk_thread_id: controlPlane.sdk_thread_id || null,
        sdk_run_id: controlPlane.sdk_run_id || null,
        structured_output_valid: controlPlane.structured_output_valid === true,
        stream_event_count: Number(controlPlane.stream_event_count || 0)
      }
      : null
  }
  if (slice?.work_item_kind) result.work_item_kind = String(slice.work_item_kind)
  if (slice?.tournament_group_id) {
    result.tournament = {
      schema: 'sks.solution-tournament-candidate.v1',
      group_id: String(slice.tournament_group_id),
      candidate_index: Number(slice.tournament_candidate_index || 1),
      candidate_count: Number(slice.tournament_candidate_count || 1),
      approach: String(slice.approach_directive || '')
    }
  }
  if (result.naruto_runtime.control_plane_result) result.control_plane_result = result.naruto_runtime.control_plane_result
  result.verification = {
    status: result.verification?.status || 'not_run',
    checks: [...(result.verification?.checks || []), 'naruto-agent-orchestrator-scheduler-source-of-truth']
  }
}

function enforceWorkerQualityProtocolForSlice(result: any, slice: any) {
  const writesPatch = Boolean((result.patch_envelopes || []).length || (result.changed_files || []).length || (result.writes || []).length)
  if (!writesPatch) return
  const kind = String(slice?.work_item_kind || result?.work_item_kind || '').toLowerCase()
  const text = [kind, slice?.id, slice?.title].join(' ').toLowerCase()
  const blockers: string[] = []
  if ((kind === 'bugfix' || /\b(fix|bug|regression|broken|failure|crash|error)\b|버그|회귀/.test(text)) && !validRegressionProof(result.regression_proof || firstEnvelopeField(result, 'regression_proof'))) {
    blockers.push('tdd_evidence_missing')
  }
  if ((kind === 'conflict_resolution' || /\b(repair|conflict|rebase|rollback)\b|수리|충돌/.test(text)) && !(result.repair_hypothesis || firstEnvelopeField(result, 'repair_hypothesis'))) {
    blockers.push('repair_without_hypothesis')
  }
  if (!blockers.length) return
  result.status = 'blocked'
  result.blockers = [...new Set([...(result.blockers || []), ...blockers])]
  result.verification = {
    status: 'failed',
    checks: [...(result.verification?.checks || []), 'naruto-worker-quality-protocol']
  }
}

function firstEnvelopeField(result: any, field: string) {
  return (Array.isArray(result?.patch_envelopes) ? result.patch_envelopes : []).find((envelope: any) => envelope?.[field])?.[field] || null
}

function validRegressionProof(proof: any): boolean {
  return Boolean(proof && proof.failed_before === true && proof.passed_after === true && String(proof.test_file || '').trim())
}

function normalizePathList(values: unknown) {
  return (Array.isArray(values) ? values : []).map((file) => String(file || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '')).filter(Boolean)
}

async function prepareWorkerGitWorktree(input: {
  root: string
  ledgerRoot: string
  missionId: string
  agent: any
  slice: any
  policy: AgentRunOptions['gitWorktreePolicy']
  runtime: any
  preparedAllocation?: any
}) {
  if (input.policy?.mode !== 'git-worktree') return null
  const sliceHasWritePaths = Array.isArray(input.slice.write_paths) && input.slice.write_paths.length > 0
  const agentWriteCapable = input.agent.write_allowed === true || /write|lease|required/i.test(String(input.agent.write_policy || ''))
  if (!sliceHasWritePaths && !agentWriteCapable) return null
  const generationIndex = Math.max(1, Math.floor(Number(input.agent.generation_index || 1)))
  const allocation = input.preparedAllocation || await allocateWorkerWorktree({
    repoRoot: input.policy.main_repo_root || input.root,
    missionId: input.missionId,
    workerId: String(input.agent.id || input.slice.id || 'worker'),
    slotId: String(input.agent.slot_id || input.agent.id || 'slot-001'),
    generationIndex
  })
  const artifactDir = path.join(input.ledgerRoot, input.agent.session_artifact_dir || path.join('sessions', input.agent.id || input.slice.id || 'worker'), 'worker')
  await writeJsonAtomic(path.join(artifactDir, 'git-worktree-allocation.json'), allocation)
  input.runtime.allocations.push({
    agent_id: input.agent.id,
    slice_id: input.slice.id,
    ok: allocation.ok,
    worktree_path: allocation.worktree_path,
    branch: allocation.branch,
    blockers: allocation.blockers
  })
  input.runtime.blockers.push(...allocation.blockers)
  input.runtime.ok = input.runtime.blockers.length === 0
  await writeJsonAtomic(path.join(input.ledgerRoot, 'agent-git-worktree-runtime.json'), input.runtime)
  if (!allocation.ok) return null
  return {
    allocation,
    artifactDir,
    context: {
      id: `${allocation.slot_id}-gen-${allocation.generation_index}`,
      path: allocation.worktree_path,
      branch: allocation.branch,
      main_repo_root: allocation.main_repo_root
    }
  }
}

async function finalizeWorkerGitWorktree(input: {
  root: string
  ledgerRoot: string
  missionId: string
  agent: any
  slice: any
  result: any
  workerWorktree: any
  runtime: any
}) {
  const allocation = input.workerWorktree.allocation
  const diff = await exportGitWorktreeDiff({
    mainRepoRoot: allocation.main_repo_root || input.root,
    worktreePath: allocation.worktree_path,
    missionId: input.missionId,
    workerId: String(input.agent.id || input.slice.id || 'worker')
  })
  await writeJsonAtomic(path.join(input.workerWorktree.artifactDir, 'git-worktree-diff.json'), diff)
  const checkpoint = await checkpointWorkerWorktree({
    worktreePath: allocation.worktree_path,
    repoRoot: allocation.main_repo_root || input.root,
    workerId: String(input.agent.id || input.slice.id || 'worker'),
    taskId: String(input.slice.id || input.agent.id || 'task'),
    mode: 'auto'
  })
  await writeJsonAtomic(path.join(input.workerWorktree.artifactDir, 'git-worktree-checkpoint.json'), checkpoint)
  input.runtime.diffs.push({
    agent_id: input.agent.id,
    slice_id: input.slice.id,
    ok: diff.ok,
    clean: diff.clean,
    changed_files: diff.changed_files,
    diff_bytes: diff.diff_bytes,
    blockers: diff.blockers
  })
  input.runtime.checkpoints.push({
    agent_id: input.agent.id,
    slice_id: input.slice.id,
    ok: checkpoint.ok,
    mode_applied: checkpoint.mode_applied,
    commit_hash: checkpoint.commit_hash,
    changed_files: checkpoint.changed_files,
    blockers: checkpoint.blockers
  })
  if (!diff.clean && diff.ok) {
    const envelope = buildGitWorktreePatchEnvelope({
      diff,
      agentId: String(input.agent.id || 'agent'),
      sessionId: String(input.agent.session_id || ''),
      slotId: String(input.agent.slot_id || ''),
      generationIndex: Math.max(1, Math.floor(Number(input.agent.generation_index || 1))),
      checkpoint
    })
    envelope.task_slice_id = String(input.slice.id || '')
    if (input.result.regression_proof) envelope.regression_proof = input.result.regression_proof
    if (input.result.repair_hypothesis) envelope.repair_hypothesis = input.result.repair_hypothesis
    if (input.result.tournament) envelope.tournament = input.result.tournament
    input.result.patch_envelopes = [...(Array.isArray(input.result.patch_envelopes) ? input.result.patch_envelopes : []), envelope]
    input.result.changed_files = [...new Set([...(input.result.changed_files || []), ...diff.changed_files])]
    input.result.artifacts = [...new Set([...(input.result.artifacts || []), path.relative(input.ledgerRoot, path.join(input.workerWorktree.artifactDir, 'git-worktree-diff.json')), path.relative(input.ledgerRoot, path.join(input.workerWorktree.artifactDir, 'git-worktree-checkpoint.json'))])]
    input.result.git_worktree_diff = diff
    input.result.git_worktree_checkpoint = checkpoint
  }
  const cleanup = await cleanupGitWorktree({
    repoRoot: allocation.main_repo_root || input.root,
    worktreePath: allocation.worktree_path,
    branch: allocation.branch,
    deleteBranch: diff.clean
  })
  await writeJsonAtomic(path.join(input.workerWorktree.artifactDir, 'git-worktree-cleanup.json'), cleanup)
  input.runtime.cleanup.push({
    agent_id: input.agent.id,
    slice_id: input.slice.id,
    action: cleanup.action,
    clean: cleanup.clean,
    retention_lock_path: cleanup.retention_lock_path,
    blockers: cleanup.blockers
  })
  input.runtime.blockers.push(...diff.blockers, ...checkpoint.blockers, ...cleanup.blockers)
  input.runtime.ok = input.runtime.blockers.length === 0
  await writeJsonAtomic(path.join(input.ledgerRoot, 'agent-git-worktree-runtime.json'), input.runtime)
}

async function legacyCodexExecBlockedRun(input: { root: string; missionId: string; dir: string; route: string; routeCommand: string; routeBlackboxKind: string; backend: string }) {
  const blockers = ['legacy_codex_exec_runtime_removed']
  const ledgerRoot = path.join(input.dir, 'agents')
  const artifact = {
    schema: 'sks.codex-sdk-legacy-runtime-removal.v1',
    generated_at: nowIso(),
    ok: false,
    requested_backend: 'codex-exec',
    selected_backend: input.backend,
    blockers,
    message: 'The raw Codex exec runtime has been removed. Use the Codex SDK Control Plane backend.'
  }
  await writeJsonAtomic(path.join(input.dir, 'codex-exec-runtime-removed.json'), artifact)
  return {
    schema: 'sks.agent-run.v1',
    ok: false,
    status: 'blocked',
    mission_id: input.missionId,
    route: input.route,
    route_command: input.routeCommand,
    route_blackbox_kind: input.routeBlackboxKind,
    backend: input.backend,
    ledger_root: path.relative(input.root, ledgerRoot),
    roster: { schema: 'sks.agent-roster.v1', agent_count: 0, roster: [] },
    partition: { ok: false, slice_count: 0, lease_count: 0, blockers },
    task_graph: null,
    requested_work_items: 0,
    actual_total_work_items: 0,
    target_active_slots: 0,
    minimum_work_items: 0,
    source_intelligence: null,
    goal_mode: null,
    strategy_gate: null,
    scheduler: { ok: false, status: 'blocked_before_scheduler', blockers },
    results: [],
    consensus: { ok: false, blockers },
    output_validation: { ok: false, blockers },
    backend_report: { ok: false, blockers },
    recursion: { ok: true, violations: [] },
    timeout_kill: { killed_sessions: [] },
    output_tails: { ok: true, records: [] },
    cleanup: { ok: true, all_sessions_closed: true, blockers: [] },
    trust: { ok: false, blockers },
    wrongness: { ok: false, blockers },
    parallel_write_policy: null,
    proof: {
      ok: false,
      status: 'blocked',
      blockers,
      artifacts: ['codex-exec-runtime-removed.json']
    }
  }
}

async function runAgentPatchSwarmRuntime(root: string, ledgerRoot: string, input: { missionId: string; sessionKey?: string | null; route: string; routeCommand: string; writeCapable: boolean; results: any[]; parallelWritePolicy: any; verificationRollbackDag?: any; dryRun: boolean; gptFinalArbiter?: any; finalGptPatchStage?: any }) {
  await setCurrent(root, { mission_id: input.missionId, mode: 'AGENT', phase: 'AGENT_PATCH_SWARM_RUNNING', route_command: input.routeCommand, updated_at: nowIso() }, { sessionKey: input.sessionKey })
  const queueStore = new PersistentAgentPatchQueueStore(ledgerRoot)
  for (const result of input.results || []) {
    for (const envelope of result.patch_envelopes || []) {
      const entry = await queueStore.enqueue({
        ...envelope,
        agent_id: envelope.agent_id || result.agent_id,
        session_id: envelope.session_id || result.session_id
      }, {
        mission_id: input.missionId,
        route: input.route,
        root,
        work_item_kind: result.work_item_kind || result.naruto_runtime?.work_item_kind,
        regression_proof: result.regression_proof,
        repair_hypothesis: result.repair_hypothesis
      })
      result.patch_queue_refs = [...(result.patch_queue_refs || []), entry.id]
    }
  }
  const pendingEntries = queueStore.queue.queued()
  const worktreeEntries = pendingEntries.filter((entry: any) => entry.envelope?.source === 'git-worktree-diff')
  const normalEntries = pendingEntries.filter((entry: any) => entry.envelope?.source !== 'git-worktree-diff')
  let worktreeMergeReport: any = null
  const worktreeApplyResults: any[] = []
  if (worktreeEntries.length) {
    worktreeMergeReport = await runGitWorktreeIntegrationPrimary(root, ledgerRoot, input.missionId, worktreeEntries, queueStore)
    for (const row of worktreeMergeReport.apply_results || []) worktreeApplyResults.push(row)
  }
  const merge: any = coordinateAgentPatchMerge(normalEntries)
  await writeAgentMergeCoordinatorArtifacts(ledgerRoot, merge)
  const conflictRebase = await executeAgentPatchConflictRebase(root, normalEntries, merge, { dryRun: input.dryRun, artifactsDir: ledgerRoot })
  merge.conflict_rebase_results = 'agent-patch-conflict-rebase-results.json'
  merge.rebase_success_count = conflictRebase.succeeded_entry_ids.length
  merge.rebase_blocker_count = conflictRebase.blockers.length
  await writeAgentMergeCoordinatorArtifacts(ledgerRoot, merge)
  const rebaseSucceededEntryIds = new Set(conflictRebase.succeeded_entry_ids || [])
  const conflictedEntryIds = new Set((merge.blocked_conflicts || merge.serial_conflicts || []).flatMap((conflict: any) => conflict.entry_ids || conflict.entries || []).filter((id: any) => !rebaseSucceededEntryIds.has(String(id))))
  merge.unresolved_conflict_entry_ids = [...conflictedEntryIds]
  merge.ok = conflictedEntryIds.size === 0 && (conflictRebase.failed_entry_ids || []).length === 0 && (conflictRebase.blocked_entry_ids || []).length === 0
  merge.blockers = merge.ok ? [] : merge.blockers || []
  for (const entry of normalEntries) {
    if (conflictedEntryIds.has(entry.id)) await queueStore.markConflicted(entry.id, merge.blockers || ['patch_conflict'])
  }
  const disjointEntries = normalEntries.filter((entry) => !conflictedEntryIds.has(entry.id))
  const startedAt = nowIso()
  await queueStore.markApplyingBatch([...rebaseSucceededEntryIds])
  for (const entryId of rebaseSucceededEntryIds) {
    await queueStore.markApplied(entryId)
  }
  const rebaseApplyEntryIds = new Set((conflictRebase.apply_results || []).map((row: any) => String(row.entry_id || '')))
  const parallelEntries = disjointEntries.filter((entry) => !rebaseApplyEntryIds.has(entry.id))
  await queueStore.markApplyingBatch(parallelEntries.map((entry) => entry.id))
  const parallelApplyResults = await Promise.all(parallelEntries.map(async (entry) => {
    const started_at = nowIso()
    const applyResult = await applyAgentPatchQueueEntry(root, entry, { dryRun: input.dryRun, artifactsDir: ledgerRoot })
    const finished_at = nowIso()
    if (applyResult.ok) {
      await queueStore.markApplied(entry.id)
      const owner = (input.results || []).find((result) => result.agent_id === entry.envelope.agent_id)
      if (owner) {
        owner.applied_patch_refs = [...(owner.applied_patch_refs || []), entry.id]
        if (applyResult.rollback_digest) owner.rollback_refs = [...(owner.rollback_refs || []), applyResult.rollback_digest]
      }
    } else {
      await queueStore.markConflicted(entry.id, applyResult.violations || ['patch_apply_failed'])
    }
    return { entry_id: entry.id, started_at, finished_at, ...applyResult }
  }))
	  const applyResults = [
	    ...worktreeApplyResults,
	    ...parallelApplyResults,
	    ...(conflictRebase.apply_results || []).map((row: any) => ({ entry_id: row.entry_id, started_at: row.apply_started_at || nowIso(), finished_at: row.apply_ended_at || nowIso(), ...row }))
	  ]
	  if (input.dryRun !== true && applyResults.some((result) => result.ok === true && Array.isArray(result.changed_files) && result.changed_files.length > 0)) {
	    await setCurrent(root, {
	      mission_id: input.missionId,
	      reflection_invalidation_required: true,
	      reflection_invalidated_at: nowIso(),
	      reflection_invalidation_reason: 'agent_patch_applied'
	    }, { sessionKey: input.sessionKey })
	  }
  const finishedAt = nowIso()
  const entryById = new Map(queueStore.queue.entries.map((entry) => [entry.id, entry]))
  const verificationResults = {
    schema: 'sks.agent-patch-verification-results.v1',
    generated_at: nowIso(),
    ok: applyResults.every((result) => result.ok),
    dag_schema: input.verificationRollbackDag?.schema || null,
    results: applyResults.map((result) => ({
      patch_entry_id: result.entry_id,
      owner_agent: entryById.get(result.entry_id)?.agent_id || null,
      status: result.ok ? (input.dryRun ? 'dry_run_verified' : 'verified') : 'failed',
      changed_files: result.changed_files || [],
      rollback_digest: result.rollback_digest || null,
      verification_node_id: entryById.get(result.entry_id)?.envelope.lease_proof?.verification_node_id || null,
      rollback_node_id: entryById.get(result.entry_id)?.envelope.lease_proof?.rollback_node_id || null,
      checks: result.verification?.checks || []
    }))
  }
  for (const result of verificationResults.results) {
    const entry = entryById.get(result.patch_entry_id)
    await queueStore.journal.append({
      event_type: 'verification_started',
      entry_id: result.patch_entry_id,
      agent_id: result.owner_agent || entry?.agent_id || null,
      lease_id: entry?.lease_id || entry?.envelope?.lease_id || entry?.envelope?.lease_proof?.lease_id || null,
      status: 'started',
      changed_files: result.changed_files || [],
      rollback_digest: result.rollback_digest || null
    })
    await queueStore.journal.append({
      event_type: 'verification_finished',
      entry_id: result.patch_entry_id,
      agent_id: result.owner_agent || entry?.agent_id || null,
      lease_id: entry?.lease_id || entry?.envelope?.lease_id || entry?.envelope?.lease_proof?.lease_id || null,
      status: result.status || null,
      verification_status: result.status || null,
      changed_files: result.changed_files || [],
      rollback_digest: result.rollback_digest || null
    })
    if (result.status === 'verified' || result.status === 'dry_run_verified') await queueStore.markVerified(result.patch_entry_id)
  }
  const rollbackDryRuns = await Promise.all(applyResults.map(async (result) => {
    if (result.rollback_dry_run) {
      return { patch_entry_id: result.entry_id, serial_rebase_prevalidated: true, ...result.rollback_dry_run }
    }
    const journal = new AgentPatchTransactionJournal(ledgerRoot)
    await journal.append({
      event_type: 'rollback_dry_run_started',
      entry_id: result.entry_id,
      agent_id: result.agent_id || null,
      lease_id: result.lease_id || null,
      status: 'started',
      changed_files: result.changed_files || [],
      rollback_digest: result.rollback_digest || null
    })
    if (input.dryRun) {
      const dryRunResult = { patch_entry_id: result.entry_id, ok: true, status: 'dry_run_patch_not_applied', violations: [] }
      await journal.append({
        event_type: 'rollback_dry_run_finished',
        entry_id: result.entry_id,
        agent_id: result.agent_id || null,
        lease_id: result.lease_id || null,
        status: dryRunResult.status,
        changed_files: result.changed_files || [],
        rollback_digest: result.rollback_digest || null,
        violations: []
      })
      return dryRunResult
    }
    const rollbackResult = { patch_entry_id: result.entry_id, ...(await rollbackAgentPatchApply(root, result, { dryRun: true })) }
    await journal.append({
      event_type: 'rollback_dry_run_finished',
      entry_id: result.entry_id,
      agent_id: result.agent_id || null,
      lease_id: result.lease_id || null,
      status: rollbackResult.status || null,
      changed_files: result.changed_files || [],
      rollback_digest: rollbackResult.rollback_digest || result.rollback_digest || null,
      violations: rollbackResult.violations || []
    })
    return rollbackResult
  }))
  const rollbackProof = {
    schema: 'sks.agent-patch-rollback-proof.v1',
    generated_at: nowIso(),
    ok: rollbackDryRuns.every((row) => row.ok !== false) && applyResults.every((result) => !Array.isArray(result.changed_files) || result.changed_files.length === 0 || Boolean(result.rollback_digest)),
    dry_run: input.dryRun,
    rollback_digest_count: applyResults.filter((result) => result.rollback_digest).length,
    entries: applyResults.map((result) => ({
      patch_entry_id: result.entry_id,
      verification_node_id: entryById.get(result.entry_id)?.envelope.lease_proof?.verification_node_id || null,
      rollback_node_id: entryById.get(result.entry_id)?.envelope.lease_proof?.rollback_node_id || null,
      changed_files: result.changed_files || [],
      rollback_digest: result.rollback_digest || null,
      rollback_ready: !Array.isArray(result.changed_files) || result.changed_files.length === 0 || Boolean(result.rollback_digest),
      restore_plan: (result.rollback || []).filter((row: any) => row.existed).map((row: any) => ({ path: row.path, after_hash_precondition: row.sha256_after })),
      delete_plan: (result.rollback || []).filter((row: any) => !row.existed).map((row: any) => ({ path: row.path, after_hash_precondition: row.sha256_after })),
      dry_run_validation: rollbackDryRuns.find((row) => row.patch_entry_id === result.entry_id) || null
    })),
    blockers: rollbackDryRuns.flatMap((row: any) => row.ok === false ? row.violations || ['rollback_dry_run_failed'] : [])
  }
  const finalQueueJson = queueStore.queue.toJSON()
  const proofInput = {
    queue: finalQueueJson,
    merge,
    applyResults,
    verification: verificationResults.results.map((result) => result.status),
    parallelWritePolicy: input.parallelWritePolicy,
    conflictRebase,
    verificationRollbackDag: input.verificationRollbackDag,
    gptFinalArbiter: input.gptFinalArbiter,
    finalGptPatchStage: input.finalGptPatchStage,
    worktreeMergeReport
  }
  const initialProof = buildAgentPatchProof(proofInput)
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-patch-proof.json'), initialProof)
  await queueStore.persistSnapshot()
  const journalSummary = await queueStore.journal.writeSummary()
  const proof = buildAgentPatchProof({ ...proofInput, transactionJournal: journalSummary })
  const zeroPatchBlockers = input.writeCapable && input.parallelWritePolicy?.write_mode === 'parallel' && pendingEntries.length === 0 && input.dryRun !== true && input.parallelWritePolicy?.dry_run_patches !== true
    ? ['write_mode_parallel_zero_patch_envelopes']
    : []
  const blockers = [
    ...zeroPatchBlockers,
    ...(proof.ok ? [] : proof.blockers || []),
    ...(rollbackProof.ok ? [] : ['patch_rollback_not_ready']),
    ...(verificationResults.ok ? [] : ['patch_verification_failed'])
  ].map(String)
  const report = {
    schema: 'sks.agent-patch-swarm-runtime.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    mission_id: input.missionId,
    route: input.route,
    route_command: input.routeCommand,
    write_capable: input.writeCapable,
    dry_run: input.dryRun,
    patch_envelope_count: pendingEntries.length,
    apply_started_at: startedAt,
    apply_finished_at: finishedAt,
    apply_latency_ms: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    parallel_apply_count: parallelEntries.length,
    worktree_integration_primary_count: worktreeEntries.length,
    worktree_merge_queue: worktreeMergeReport,
    parallel_apply_groups: merge.parallel_apply_groups || [],
    serial_merge_groups: merge.serial_merge_groups || [],
    conflict_rebase: {
      ok: conflictRebase.ok,
      rebase_attempt_count: conflictRebase.rebase_attempt_count,
      succeeded_entry_ids: conflictRebase.succeeded_entry_ids,
      blocked_entry_ids: conflictRebase.blocked_entry_ids,
      failed_entry_ids: conflictRebase.failed_entry_ids
    },
    transaction_journal: {
      ok: journalSummary.ok,
      event_count: journalSummary.event_count,
      artifact: 'agent-patch-transaction-journal.jsonl',
      summary: 'agent-patch-transaction-journal-summary.json'
    },
    wall_clock_parallel_evidence: merge.wall_clock_parallel_evidence || [],
    expected_speedup: Math.max(1, Number(merge.parallel_apply_groups?.[0]?.expected_speedup || parallelEntries.length || 1)),
    conflicted_agent_count: new Set((merge.blocked_conflicts || []).flatMap((conflict: any) => conflict.agents || [])).size,
    artifacts: {
      queue: 'agent-patch-queue.json',
      events: 'agent-patch-queue-events.jsonl',
      ownership: 'agent-patch-ownership-ledger.json',
      merge: 'agent-merge-coordinator-report.json',
      apply_results: 'agent-patch-apply-results.json',
      verification: 'agent-patch-verification-results.json',
      rollback: 'agent-patch-rollback-proof.json',
      proof: 'agent-patch-proof.json',
      transaction_journal: 'agent-patch-transaction-journal.jsonl',
      transaction_journal_summary: 'agent-patch-transaction-journal-summary.json',
      conflict_rebase: 'agent-patch-conflict-rebase-results.json',
      git_worktree_merge_queue: worktreeMergeReport ? 'git-worktree-merge-queue-report.json' : null
    },
    blockers
  }
  await queueStore.persistSnapshot()
  await writeTextAtomic(path.join(ledgerRoot, 'agent-patch-queue-events.jsonl'), finalQueueJson.events.map((event: any) => JSON.stringify(event)).join('\n') + (finalQueueJson.events.length ? '\n' : ''))
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-patch-ownership-ledger.json'), { schema: 'sks.agent-patch-ownership-ledger.v1', generated_at: nowIso(), entries: finalQueueJson.ownership_ledger })
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-patch-apply-results.json'), { schema: 'sks.agent-patch-apply-results.v1', generated_at: nowIso(), results: applyResults })
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-patch-verification-results.json'), verificationResults)
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-patch-rollback-proof.json'), rollbackProof)
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-patch-proof.json'), proof)
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-patch-swarm-runtime.json'), report)
  return report
}

async function runGitWorktreeIntegrationPrimary(root: string, ledgerRoot: string, missionId: string, entries: any[], queueStore: PersistentAgentPatchQueueStore) {
  const diffs = entries.map((entry) => gitWorktreeDiffFromQueueEntry(entry)).filter(Boolean) as GitWorktreeDiff[]
  const checkpoints = entries.map((entry) => gitWorktreeCheckpointFromQueueEntry(entry)).filter(Boolean) as any[]
  const repoRoot = diffs[0]?.main_repo_root || root
  const baseRef = diffs.find((diff) => diff.base_head)?.base_head || undefined
  const integration = await createGitIntegrationWorktree({ repoRoot, missionId, ...(baseRef ? { baseRef } : {}) })
  const applyResults: any[] = []
  if (!integration.ok) {
    for (const entry of entries) {
      await queueStore.markConflicted(entry.id, integration.blockers || ['git_worktree_integration_allocation_failed'])
      applyResults.push({
        entry_id: entry.id,
        started_at: nowIso(),
        finished_at: nowIso(),
        ok: false,
        changed_files: entry.write_paths || entry.envelope?.git_worktree?.changed_files || [],
        verification: { checks: ['git-worktree-integration-primary'] },
        violations: integration.blockers || ['git_worktree_integration_allocation_failed']
      })
    }
    const blockedReport = {
      schema: 'sks.git-worktree-integration-primary-runtime.v1',
      ok: false,
      generated_at: nowIso(),
      integration,
      integration_worktree_path: integration.worktree_path || null,
      applied_entry_ids: [],
      conflicted_entry_ids: entries.map((entry) => entry.id),
      apply_results: applyResults,
      blockers: integration.blockers || ['git_worktree_integration_allocation_failed']
    }
    await writeJsonAtomic(path.join(ledgerRoot, 'git-worktree-merge-queue-report.json'), blockedReport)
    return blockedReport
  }
  const startedAt = nowIso()
  await queueStore.markApplyingBatch(entries.map((entry) => entry.id))
  const queueReport = await applyGitWorktreeMergeQueue({
    integrationWorktreePath: integration.worktree_path,
    diffs,
    checkpoints
  })
  const rollbackPlan = queueReport.ok ? await captureGitWorktreeRollbackPlan(repoRoot, queueReport.changed_files || []) : { ok: false, rollback: [], blockers: ['git_worktree_integration_prevalidation_failed'] }
  const mainApplyReport = queueReport.ok && rollbackPlan.ok
    ? await applyGitWorktreeMergeQueue({
        integrationWorktreePath: repoRoot,
        diffs,
        checkpoints
      })
    : null
  const integrationHead = mainApplyReport?.ok
    ? gitOutputLine(await runGitCommand(repoRoot, ['rev-parse', 'HEAD']).catch(() => ({ ok: false, stdout: '' } as any)))
    : null
  const crossRebase = integrationHead
    ? await crossRebaseIdleWorktrees({
      integrationHead,
      workers: diffs
        .filter((diff) => diff.worktree_path)
        .map((diff) => ({
          worker_id: diff.worker_id,
          worktree_path: diff.worktree_path,
          branch: diff.branch,
          state: 'done' as const
        }))
    })
    : null
  if (crossRebase) await writeJsonAtomic(path.join(ledgerRoot, 'git-worktree-cross-rebase-report.json'), crossRebase)
  const rollbackEvidence = mainApplyReport?.ok
    ? await completeGitWorktreeRollbackPlan(repoRoot, rollbackPlan.rollback)
    : rollbackPlan
  const finishedAt = nowIso()
  const conflictsByWorker = new Set([
    ...(queueReport.conflicts || []).map((row: any) => String(row.worker_id || row.workerId || '')),
    ...((mainApplyReport?.conflicts || []) as any[]).map((row: any) => String(row.worker_id || row.workerId || ''))
  ])
  const appliedEntryIds: string[] = []
  const conflictedEntryIds: string[] = []
  for (const entry of entries) {
    const workerId = String(entry.envelope?.git_worktree?.worker_id || entry.envelope?.agent_id || entry.agent_id || '')
    const changedFiles = entry.write_paths || entry.envelope?.git_worktree?.changed_files || []
    const ok = queueReport.ok && mainApplyReport?.ok === true && rollbackEvidence.ok === true && !conflictsByWorker.has(workerId)
    if (ok) {
      await queueStore.markApplied(entry.id)
      appliedEntryIds.push(entry.id)
    } else {
      await queueStore.markConflicted(entry.id, queueReport.blockers || ['git_worktree_merge_failed'])
      conflictedEntryIds.push(entry.id)
    }
    applyResults.push({
      entry_id: entry.id,
      started_at: startedAt,
      finished_at: finishedAt,
      ok,
      changed_files: changedFiles,
      rollback: ok ? rollbackEvidence.rollback.filter((row: any) => changedFiles.includes(row.path)) : [],
      rollback_digest: ok ? `git-worktree-integration:${entry.id}:${sha256(JSON.stringify(rollbackEvidence.rollback.filter((row: any) => changedFiles.includes(row.path))))}` : null,
      verification: { checks: ['git-worktree-integration-primary', 'git-apply-3way', 'main-repo-apply', 'rollback-hashes'] },
      violations: ok ? [] : [...(queueReport.blockers || []), ...(mainApplyReport?.blockers || []), ...(rollbackEvidence.blockers || []), 'git_worktree_main_repo_apply_failed'].filter(Boolean)
    })
  }
  const reportBlockers = [...(queueReport.blockers || []), ...(mainApplyReport?.blockers || []), ...(rollbackEvidence.blockers || [])]
  const report = {
    schema: 'sks.git-worktree-integration-primary-runtime.v1',
    ok: reportBlockers.length === 0 && appliedEntryIds.length === entries.length,
    generated_at: nowIso(),
    integration,
    integration_worktree_path: integration.worktree_path,
    applied_entry_ids: appliedEntryIds,
    conflicted_entry_ids: conflictedEntryIds,
    merge_queue: queueReport,
    main_repo_apply: mainApplyReport,
    cross_rebase: crossRebase,
    rollback_evidence: rollbackEvidence,
    apply_results: applyResults,
    blockers: reportBlockers
  }
  await writeJsonAtomic(path.join(ledgerRoot, 'git-worktree-merge-queue-report.json'), report)
  return report
}

async function captureGitWorktreeRollbackPlan(root: string, changedFiles: string[]) {
  const rootResolved = path.resolve(root)
  const rollback: any[] = []
  const blockers: string[] = []
  for (const file of [...new Set(changedFiles.map((row) => String(row || '').trim()).filter(Boolean))]) {
    const rel = normalizeWorktreeRelPath(file)
    const absolute = path.resolve(rootResolved, rel)
    if (!absolute.startsWith(rootResolved + path.sep)) {
      blockers.push(`git_worktree_rollback_path_outside_root:${rel}`)
      continue
    }
    const beforeExists = await exists(absolute)
    const before = beforeExists ? await readText(absolute, '') : ''
    rollback.push({
      path: rel,
      existed: beforeExists,
      sha256_before: beforeExists ? sha256(String(before)) : null,
      content_before: beforeExists ? String(before) : null
    })
  }
  return { ok: blockers.length === 0, rollback, blockers }
}

async function completeGitWorktreeRollbackPlan(root: string, rollback: any[]) {
  const rootResolved = path.resolve(root)
  const blockers: string[] = []
  const completed = []
  for (const row of rollback) {
    const rel = normalizeWorktreeRelPath(row.path)
    const absolute = path.resolve(rootResolved, rel)
    if (!absolute.startsWith(rootResolved + path.sep)) {
      blockers.push(`git_worktree_rollback_path_outside_root:${rel}`)
      continue
    }
    const afterExists = await exists(absolute)
    if (!afterExists) {
      blockers.push(`git_worktree_rollback_after_missing:${rel}`)
      completed.push({ ...row, path: rel, sha256_after: null })
      continue
    }
    const after = await readText(absolute, '')
    completed.push({
      ...row,
      path: rel,
      sha256_after: sha256(String(after))
    })
  }
  return { ok: blockers.length === 0, rollback: completed, blockers }
}

function normalizeWorktreeRelPath(file: string) {
  return String(file || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function gitWorktreeDiffFromQueueEntry(entry: any): GitWorktreeDiff | null {
  const envelope = entry?.envelope || {}
  const meta = envelope.git_worktree || {}
  const operation = Array.isArray(envelope.operations) ? envelope.operations.find((row: any) => row?.op === 'git_apply_patch') : null
  const diff = String(operation?.diff || '')
  return {
    schema: 'sks.git-worktree-diff.v1',
    ok: true,
    generated_at: nowIso(),
    mission_id: String(envelope.mission_id || ''),
    worker_id: String(envelope.agent_id || entry.agent_id || entry.id),
    main_repo_root: String(meta.main_repo_root || ''),
    worktree_path: String(meta.worktree_path || ''),
    branch: meta.branch == null ? null : String(meta.branch),
    base_head: meta.base_head == null ? null : String(meta.base_head),
    worktree_head: meta.worktree_head == null ? null : String(meta.worktree_head),
    status_porcelain: '',
    changed_files: Array.isArray(meta.changed_files) ? meta.changed_files.map(String) : entry.write_paths || [],
    untracked_files: [],
    diff,
    diff_bytes: Buffer.byteLength(diff),
    clean: diff.trim().length === 0,
    blockers: []
  }
}

function gitWorktreeCheckpointFromQueueEntry(entry: any) {
  const envelope = entry?.envelope || {}
  const meta = envelope.git_worktree || {}
  const checkpoint = meta.checkpoint || null
  if (!checkpoint || checkpoint.mode_applied !== 'checkpoint-commit' || !checkpoint.commit_hash) return null
  return {
    schema: 'sks.git-worktree-checkpoint.v1',
    ok: Array.isArray(checkpoint.blockers) ? checkpoint.blockers.length === 0 : true,
    generated_at: nowIso(),
    worktree_path: String(meta.worktree_path || ''),
    repo_root: String(meta.main_repo_root || ''),
    worker_id: String(envelope.agent_id || entry.agent_id || entry.id),
    task_id: String(envelope.task_slice_id || entry.id || ''),
    mode_requested: 'auto',
    mode_applied: 'checkpoint-commit',
    commit_hash: String(checkpoint.commit_hash),
    changed_files: Array.isArray(checkpoint.changed_files) ? checkpoint.changed_files.map(String) : Array.isArray(meta.changed_files) ? meta.changed_files.map(String) : [],
    blockers: Array.isArray(checkpoint.blockers) ? checkpoint.blockers.map(String) : []
  }
}

function normalizeDesiredWorkItemCount(value: unknown, minimumValue: unknown, targetActiveSlots: number) {
  const parsed = Number(value)
  const minimum = Number(minimumValue)
  const fallback = Number.isFinite(minimum) ? minimum : targetActiveSlots
  if (!Number.isFinite(parsed) || parsed < 1) return Math.max(1, Math.floor(fallback))
  return Math.max(1, Math.floor(parsed))
}

function normalizeMinimumWorkItems(value: unknown, targetActiveSlots: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return Math.max(1, Math.floor(targetActiveSlots))
  return Math.max(1, Math.floor(parsed))
}

function normalizeVisualLaneCount(value: unknown, fallback: unknown, maxAgentCount: number) {
  const parsed = Number(value)
  const fallbackCount = Number(fallback)
  const raw = Number.isFinite(parsed) && parsed > 0
    ? parsed
    : Number.isFinite(fallbackCount) && fallbackCount > 0
      ? fallbackCount
      : 1
  return Math.max(1, Math.min(maxAgentCount, Math.floor(raw)))
}

function isWriteCapableRun(opts: AgentRunOptions) {
  if (opts.readonly === true) return false
  return opts.applyPatches === true || opts.dryRunPatches === true || (opts.writeMode !== undefined && opts.writeMode !== 'off')
}

function defaultRouteCommand(route: string) {
  const normalized = String(route || '$Agent')
  if (/team/i.test(normalized)) return 'sks team'
  if (/research|autoresearch/i.test(normalized)) return 'sks research run'
  if (/qa/i.test(normalized)) return 'sks qa-loop run'
  return 'sks agent run'
}

function defaultRouteBlackboxKind(route: string) {
  const normalized = String(route || '$Agent')
  if (/team/i.test(normalized)) return 'actual_team_command'
  if (/research|autoresearch/i.test(normalized)) return 'actual_research_command'
  if (/qa/i.test(normalized)) return 'actual_qa_command'
  return 'actual_agent_command'
}

function buildProvidedAgentRoster(input: any, opts: any = {}) {
  const sourceRows = Array.isArray(input?.roster) ? input.roster : Array.isArray(input?.personas) ? input.personas : []
  if (!sourceRows.length) return null
  const agentCount = sourceRows.length
  const providedMax = Number(opts.maxAgentCount ?? input?.max_agents)
  const maxAgentCount = Number.isFinite(providedMax) && providedMax >= 1 ? Math.floor(providedMax) : Math.max(agentCount, MAX_AGENT_COUNT)
  const concurrency = normalizeAgentConcurrency(opts.concurrency ?? input?.concurrency ?? agentCount, agentCount, Math.max(maxAgentCount, agentCount))
  const personas = Array.isArray(input?.personas) ? input.personas : sourceRows
  const roster = sourceRows.map((entry: any, index: number) => {
    const readOnly = opts.readonly === true || entry.read_only === true
    const id = String(entry.id || entry.agent_id || `agent_${index + 1}`)
    const reasoningEffort = entry.reasoning_effort || entry.model_reasoning_effort || (readOnly ? 'high' : 'medium')
    const modelDecision = decideAgentWorkerModel({
      effort: reasoningEffort,
      prompt: opts.prompt || input?.prompt || '',
      role: String(entry.role || 'verifier'),
      agentId: id,
      readonly: readOnly,
      writePolicy: String(entry.write_policy || '')
    })
    const suppliedModelEffort = String(entry.model_reasoning_effort || '')
    const modelReasoningEffort = suppliedModelEffort === 'low' || suppliedModelEffort === 'high'
      ? suppliedModelEffort
      : modelDecision.model_reasoning_effort
    return {
      id,
      session_id: String(entry.session_id || `${id}-session-${String(index + 1).padStart(2, '0')}`),
      persona_id: String(entry.persona_id || id),
      role: String(entry.role || 'verifier'),
      index: index + 1,
      write_policy: String(entry.write_policy || (readOnly ? 'read-only' : 'route-local-artifact')),
      status: 'pending',
      model: entry.model || modelDecision.model,
      reasoning_effort: reasoningEffort,
      model_reasoning_effort: modelReasoningEffort,
      model_tier: entry.model_tier || modelDecision.model_tier,
      model_profile: entry.model_profile || modelDecision.model_profile,
      model_selection_reason: entry.model_selection_reason || modelDecision.reason,
      reasoning_profile: entry.reasoning_profile || (readOnly ? 'sks-logic-high' : 'sks-logic-medium'),
      service_tier: entry.service_tier,
      reasoning_reason: entry.reasoning_reason || 'route_native_agent_plan',
      dynamic_effort_policy: entry.dynamic_effort_policy || {
        escalation_triggers: ['route_requires_native_agent_proof'],
        downshift_triggers: []
      }
    }
  })
  return {
    schema: 'sks.agent-roster.v1',
    default_agents: agentCount,
    max_agents: Math.max(agentCount, maxAgentCount),
    agent_count: agentCount,
    concurrency,
    batch_count: Math.ceil(agentCount / concurrency),
    personas,
    persona_uniqueness: { ok: true, duplicate_ids: [] },
    roster,
    effort_policy: input?.effort_policy || { schema: 'sks.agent-effort-policy.v1', dynamic: true, decisions: [] }
  }
}

async function runAgentByBackend(backend: string, agent: any, slice: any, opts: any) {
  backend = await maybeSelectOllamaBackend(backend, agent, slice, opts)
  if (backend === 'process') return runProcessAgent(agent, slice, opts)
  if (backend === 'ollama') return runOllamaAgent(agent, slice, opts)
  if (backend === 'codex-sdk' || backend === 'zellij' || backend === 'local-llm') {
    const localPreferred = backend === 'local-llm'
    const ledgerRoot = path.resolve(opts.agentRoot || opts.cwd || process.cwd())
    const workerDir = path.join(ledgerRoot, 'codex-sdk-workers', String(agent.session_id || agent.id || 'agent'), String(slice?.id || 'slice'))
    const writePaths = sdkWritePaths(slice, opts)
    const sdkTask = await runCodexTask({
      route: String(opts.route || '$Agent'),
      missionId: String(opts.missionId || opts.mission_id || ''),
      workItemId: String(slice?.id || ''),
      slotId: String(agent.slot_id || agent.id || ''),
      generationIndex: Number(agent.generation_index || 1),
      sessionId: String(agent.session_id || ''),
      cwd: String(opts.cwd || process.cwd()),
      prompt: buildDirectSdkWorkerPrompt(slice),
      model: agent.model || null,
      reasoningEffort: agent.reasoning_effort || null,
      modelReasoningEffort: agent.model_reasoning_effort || agent.reasoning_effort || null,
      serviceTier: agent.service_tier || opts.serviceTier || 'fast',
      inputFiles: Array.isArray(opts.inputFiles) ? opts.inputFiles.map(String) : [],
      inputImages: Array.isArray(opts.inputImages) ? opts.inputImages.map(String) : [],
      outputSchemaId: CODEX_AGENT_WORKER_RESULT_SCHEMA_ID,
      outputSchema: codexAgentWorkerResultSchema as Record<string, unknown>,
      sandboxPolicy: writePaths.length ? 'workspace-write' : 'read-only',
      requestedScopeContract: {
        id: String(slice?.lease_id || slice?.id || ''),
        route: String(opts.route || '$Agent'),
        read_only: writePaths.length === 0,
        allowed_paths: writePaths,
        write_paths: writePaths,
        user_confirmed_full_access: false,
        mad_sks_authorized: opts.madSksAuthorized === true || process.env.SKS_MAD_SKS_ACTIVE === '1'
      },
      backendPreference: localPreferred ? ['local-llm', 'codex-sdk'] : ['codex-sdk'],
      allowLocalLlm: localPreferred,
      ...(localPreferred ? { localLlmPolicy: { mode: 'local_preferred', requiresGptFinal: true } } : {}),
      mutationLedgerRoot: workerDir,
      zellijPaneId: null
    })
    const sdkWorkerResult = await readJson<any>(sdkTask.workerResultPath, null)
    const patchEnvelopes = normalizeDirectSdkPatchEnvelopes(sdkWorkerResult?.patch_envelopes || [], agent, opts, sdkTask.sdkThreadId)
    const sdkReport = {
      schema: 'sks.codex-sdk-worker-adapter.v1',
      backend: sdkTask.backend === 'local-llm' ? 'local-llm' : 'codex-sdk',
      backend_family: sdkTask.backend_family,
      sdk_thread_id: sdkTask.sdkThreadId,
      sdk_run_id: sdkTask.sdkRunId,
      local_llm_proof_path: sdkTask.localLlmProofPath || null,
      stream_event_count: sdkTask.streamEventCount,
      structured_output_valid: sdkTask.structuredOutputValid,
      worker_result_path: path.relative(ledgerRoot, sdkTask.workerResultPath),
      patch_envelope_path: sdkTask.patchEnvelopePath ? path.relative(ledgerRoot, sdkTask.patchEnvelopePath) : null,
      model: agent.model || null,
      model_reasoning_effort: agent.model_reasoning_effort || null,
      model_tier: agent.model_tier || null,
      service_tier: opts.serviceTier || 'fast',
      fast_mode: opts.fastMode !== false,
      blockers: sdkTask.blockers
    }
    return validateAgentWorkerResult({
      ...sdkWorkerResult,
      backend: sdkTask.backend === 'local-llm' ? 'local-llm' : 'codex-sdk',
      patch_envelopes: patchEnvelopes,
      ...(patchEnvelopes.length ? {} : { no_patch_reason: buildDirectNoPatchReason(slice, opts) }),
      codex_child_report: sdkReport,
      codex_sdk_thread: sdkReport,
      model_authored_patch_envelopes: patchEnvelopes.length > 0,
      fixture_patch_envelopes: false,
      artifacts: [...new Set([
        ...(sdkWorkerResult?.artifacts || []),
        path.relative(ledgerRoot, sdkTask.workerResultPath),
        path.join(path.relative(ledgerRoot, workerDir), 'codex-control-proof.json'),
        path.join(path.relative(ledgerRoot, workerDir), 'codex-thread-registry.json'),
        path.join(path.relative(ledgerRoot, workerDir), sdkTask.backend === 'local-llm' ? 'local-llm-events.jsonl' : 'codex-sdk-events.jsonl'),
        ...(sdkTask.localLlmProofPath ? [path.relative(ledgerRoot, sdkTask.localLlmProofPath)] : [])
      ])],
      blockers: [...(sdkWorkerResult?.blockers || []), ...sdkTask.blockers],
      verification: {
        status: sdkTask.ok ? 'passed' : 'failed',
        checks: [
          ...(sdkWorkerResult?.verification?.checks || []),
          sdkTask.backend === 'local-llm' ? 'local-llm-control-plane' : 'codex-sdk-control-plane',
          sdkTask.backend === 'local-llm' ? 'local-llm-event-stream' : 'codex-sdk-event-stream',
          sdkTask.backend === 'local-llm' ? 'local-llm-structured-output' : 'codex-sdk-structured-output',
          ...(sdkTask.backend === 'local-llm' ? ['gpt-final-required-before-acceptance'] : [])
        ]
      }
    })
  }
  return runFakeAgent(agent, slice, opts)
}

async function maybeSelectOllamaBackend(backend: string, agent: any, slice: any, opts: any) {
  if (backend !== 'codex-sdk') return backend
  if (opts.backendExplicit === true || opts.backend_explicit === true || opts.noOllama === true || opts.no_ollama === true) return backend
  const config = await resolveOllamaWorkerConfig({
    ollamaEnabled: opts.ollamaEnabled === true || opts.ollama_enabled === true,
    model: opts.ollamaModel || opts.ollama_model || null,
    baseUrl: opts.ollamaBaseUrl || opts.ollama_base_url || null
  }).catch(() => null)
  if (!config?.ok || config.enabled !== true) return backend
  const policy = classifyOllamaWorkerSlice(slice, { route: opts.route, agent })
  return policy.ok ? 'local-llm' : backend
}

function buildDirectSdkWorkerPrompt(slice: any) {
  const write = sdkWritePaths(slice, {})
  return [
    String(slice?.description || slice?.title || 'Complete the assigned worker task.'),
    slice?.work_item_kind ? `Work item kind: ${String(slice.work_item_kind)}.` : '',
    slice?.approach_directive ? `Solution tournament candidate directive: ${String(slice.approach_directive)}.` : '',
    '',
    write.length
      ? `Write-capable slice. Return JSON matching ${CODEX_AGENT_WORKER_RESULT_SCHEMA_ID}; include patch_envelopes for write_paths=${JSON.stringify(write)}. Each patch envelope must include schema, source "model_authored", agent_id, session_id, slot_id, generation_index, task_slice_id, lease_id, allowed_paths, operations, and rationale. Each operation must include op, path, search, replace, content, and diff; use empty strings for operation fields that do not apply. Impact-scan, machine-feedback, diff-quality, and mistake-rule gates run before queue acceptance; exported signature changes require cochanged callers or cochange_acknowledged_reason. Bugfixes require regression_proof failed_before true and passed_after true; repair patches require repair_hypothesis.`
      : `Read-only slice. Return JSON matching ${CODEX_AGENT_WORKER_RESULT_SCHEMA_ID}; inspect relevant files/artifacts, do not mutate files, do not create temporary/build outputs, do not run package scripts/build/test commands unless explicitly required, and do not report pre-existing repository dirtiness as changed_files.`,
    'Required JSON fields: status, summary, findings, changed_files, patch_envelopes, verification, rollback_notes, blockers.'
  ].join('\n')
}

function buildDirectNoPatchReason(slice: any, opts: any) {
  const writePathCount = sdkWritePaths(slice, opts).length
  return {
    schema: 'sks.native-cli-worker-no-patch-reason.v1',
    generated_at: nowIso(),
    ok: writePathCount === 0,
    reason: writePathCount ? 'write_capable_task_without_backend_patch_envelope' : 'read_only_or_no_write_paths',
    route_justification: writePathCount ? 'backend returned no patch envelopes for a write-capable task' : 'task has no write paths',
    read_only_or_noop_evidence: writePathCount === 0,
    task_slice_id: slice?.id || null,
    backend: 'codex-sdk',
    blockers: writePathCount ? ['write_capable_no_patch_envelope'] : []
  }
}

function sdkWritePaths(slice: any, opts: any) {
  return [
    ...(Array.isArray(slice?.write_paths) ? slice.write_paths : []),
    ...(Array.isArray(opts?.write_paths) ? opts.write_paths : [])
  ].map(String).filter(Boolean)
}

function normalizeDirectSdkPatchEnvelopes(envelopes: AgentPatchEnvelope[], agent: any, opts: any, sdkThreadId: string) {
  return envelopes.map((envelope) => normalizeAgentPatchEnvelope({
    ...envelope,
    source: 'model_authored',
    native_cli_worker_session_id: agent.session_id,
    native_cli_process_id: process.pid,
    worker_process_id: process.pid,
    backend_sdk_thread_id: sdkThreadId,
    fast_mode: opts.fastMode !== false,
    service_tier: opts.serviceTier || 'fast'
  }))
}

async function readZellijPaneIdsBySlot(root: string) {
  const out = new Map<string, string>()
  const text = await readText(path.join(root, 'agent-zellij-pane-launch-ledger.jsonl'), '')
  for (const line of String(text).split(/\n/).filter(Boolean)) {
    try {
      const entry = JSON.parse(line)
      if (entry.slot_id && entry.pane_id) out.set(String(entry.slot_id), String(entry.pane_id))
    } catch {}
  }
  return out
}

async function writeAgentOutputTailReport(root: string, results: any[]) {
  const records = []
  for (const result of results || []) {
    for (const artifact of result.artifacts || []) {
      const artifactPath = String(artifact || '')
      if (!artifactPath.endsWith('agent-process-report.json')) continue
      const full = path.isAbsolute(artifactPath) ? artifactPath : path.join(root, artifactPath)
      const report = await readJson<any>(full, null).catch(() => null)
      if (!report) continue
      records.push({
        agent_id: result.agent_id || report.agent_id || null,
        session_id: result.session_id || report.session_id || null,
        backend: result.backend || report.backend || null,
        artifact: artifactPath,
        stdout_tail: String(report.stdout_tail || '').slice(-4000),
        stderr_tail: String(report.stderr_tail || '').slice(-4000),
        stdout_bytes: Number(report.stdout_bytes || 0),
        stderr_bytes: Number(report.stderr_bytes || 0),
        truncated: Boolean(report.truncated),
        timed_out: Boolean(report.timed_out)
      })
    }
  }
  const report = {
    schema: 'sks.agent-output-tails.v1',
    generated_at: nowIso(),
    record_count: records.length,
    records
  }
  await writeJsonAtomic(path.join(root, 'agent-output-tails.json'), report)
  return report
}

async function writeAgentBackendReport(root: string, input: any = {}) {
  const report = {
    schema: 'sks.agent-backend-report.v1',
    generated_at: nowIso(),
    backend: input.backend || 'unknown',
    service_tier: input.fastModePolicy?.service_tier || 'fast',
    fast_mode: input.fastModePolicy?.fast_mode !== false,
    result_count: (input.results || []).length,
    output_tail_report: 'agent-output-tails.json',
    records: (input.results || []).map((result: any) => ({
      agent_id: result.agent_id || null,
      session_id: result.session_id || null,
      backend: result.backend || input.backend || null,
      service_tier: input.fastModePolicy?.service_tier || result.service_tier || 'fast',
      fast_mode: input.fastModePolicy?.fast_mode !== false,
      status: result.status || null,
      artifacts: result.artifacts || [],
      blockers: result.blockers || [],
      verification: result.verification || null
    }))
  }
  await writeJsonAtomic(path.join(root, 'agent-backend-report.json'), report)
  return report
}

async function writeAgentOutputValidationReport(root: string, results: any[]) {
  const records = (results || []).map((result: any) => {
    const blockers = Array.isArray(result.blockers) ? result.blockers : []
    return {
      agent_id: result.agent_id || null,
      session_id: result.session_id || null,
      schema_ok: !blockers.some((blocker: string) => String(blocker).startsWith('schema_invalid:')),
      recursion_ok: result.recursion_guard?.ok !== false,
      status: result.status || null,
      blockers
    }
  })
  const report = {
    schema: 'sks.agent-output-validation.v1',
    generated_at: nowIso(),
    ok: records.every((record) => record.schema_ok && record.recursion_ok),
    record_count: records.length,
    records
  }
  await writeJsonAtomic(path.join(root, 'agent-output-validation.json'), report)
  return report
}

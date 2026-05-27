import path from 'node:path'
import { createMission, missionDir, setCurrent } from '../mission.js'
import { nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'
import { buildAgentRoster, normalizeAgentConcurrency } from './agent-roster.js'
import { buildAgentWorkPartition } from './agent-work-partition.js'
import { initializeAgentCentralLedger, appendAgentLedgerEvent, compactAgentLedger } from './agent-central-ledger.js'
import { detectStaleAgentSessions, killTimedOutAgentSessions, openAgentSession, heartbeatAgentSession, collectAgentSession, completeAgentSession, closeAgentSession, writeAgentLifecycleAggregate, writeAgentLifecyclePolicy } from './agent-lifecycle.js'
import { writeAgentConsensus } from './agent-consensus.js'
import { writeAgentProofEvidence } from './agent-proof-evidence.js'
import { normalizeAgentBackend } from './agent-schema.js'
import type { AgentRunOptions } from './agent-schema.js'
import { runFakeAgent } from './agent-runner-fake.js'
import { runProcessAgent } from './agent-runner-process.js'
import { runCodexExecAgent } from './agent-runner-codex-exec.js'
import { runTmuxAgent } from './agent-runner-tmux.js'
import { writeAgentCleanupReport } from './agent-cleanup.js'
import { writeAgentTrustReport } from './agent-trust-report.js'
import { writeAgentWrongnessRecords } from './agent-wrongness.js'
import { writeAgentRecursionGuardReport } from './agent-recursion-guard.js'
import { appendAgentCodexCockpitHookEvent, writeAgentCodexCockpitArtifacts } from './agent-codex-cockpit.js'
import { runAgentJanitor } from './agent-janitor.js'
import { startAgentTerminalSession, closeAgentTerminalSession } from './agent-terminal-session.js'
import { writeScoutPolicyArtifact } from './scout-policy.js'
import { writeTmuxRightLaneCockpit } from './tmux-right-lane-cockpit.js'
import { buildProjectNamespace, namespacedAgentSessionId, writeProjectNamespaceArtifact } from '../session/project-namespace.js'
import { normalizeTargetActiveSlots, runAgentScheduler } from './agent-scheduler.js'
import { runSourceIntelligence } from '../source-intelligence/source-intelligence-runner.js'
import { detectOfficialGoalMode, writeOfficialGoalModeArtifact } from '../codex/official-goal-mode.js'
import { writeAgentTaskGraph } from './agent-task-graph.js'
import { drainTmuxLaneSupervisor, initializeTmuxLaneSupervisor, updateTmuxLaneSupervisorFromSlots, verifyTmuxLaneSurvival } from './tmux-lane-supervisor.js'
import { writeTmuxPhysicalProof } from './tmux-physical-proof.js'
import { writeIntelligentWorkGraphArtifacts } from './intelligent-work-graph.js'
import { writeAdhdOrchestrationArtifacts } from '../strategy/adhd-orchestrating-gate.js'
import { compileStrategy, writeStrategyCompilerArtifacts } from '../strategy/strategy-compiler.js'
import { evaluateStrategyGate, writeStrategyGateArtifact } from '../strategy/strategy-gate.js'

export async function runNativeAgentOrchestrator(opts: AgentRunOptions = {}) {
  const root = path.resolve(opts.root || process.cwd())
  const prompt = String(opts.prompt || 'Native agent run')
  const route = opts.route || '$Agent'
  const routeCommand = String(opts.routeCommand || defaultRouteCommand(route))
  const routeBlackboxKind = String(opts.routeBlackboxKind || defaultRouteBlackboxKind(route))
  const backend = normalizeAgentBackend(opts.backend || (opts.mock ? 'fake' : 'codex-exec'))
  const realTmux = backend === 'tmux' && opts.real === true
  const realTmuxProofRequired = realTmux && process.env.SKS_REQUIRE_REAL_TMUX === '1'
  const created = opts.missionId
    ? { id: opts.missionId, dir: missionDir(root, opts.missionId), mission: { id: opts.missionId, mode: 'agent', prompt } }
    : await createMission(root, { mode: 'agent', prompt })
  const missionId = created.id
  const dir = created.dir
  const namespace = await buildProjectNamespace({ root, missionId })
  await writeProjectNamespaceArtifact(dir, namespace)
  const roster = buildProvidedAgentRoster(opts.roster, { concurrency: opts.concurrency, readonly: opts.readonly }) || buildAgentRoster({ agents: opts.agents, concurrency: opts.concurrency, prompt, ...(opts.readonly === undefined ? {} : { readonly: opts.readonly }) })
  roster.roster = roster.roster.map((agent: any) => ({
    ...agent,
    session_id: namespacedAgentSessionId({
      agentId: agent.id,
      missionId,
      rootHash: namespace.root_hash,
      index: agent.index
    })
  }))
  const targetActiveSlots = normalizeTargetActiveSlots(opts.targetActiveSlots ?? opts.agents ?? roster.agent_count)
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
    sourceIntelligenceOk: sourceIntelligence.ok
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
    await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: 'AGENT_STRATEGY_GATE_BLOCKED', route_command: routeCommand, native_agent_backend: backend, updated_at: nowIso() })
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
  const partition = await buildAgentWorkPartition(root, roster, prompt, {
    route,
    targetActiveSlots,
    desiredWorkItemCount,
    minimumWorkItems,
    sourceIntelligenceRefs: sourceIntelligenceRef,
    goalModeRef,
    strategyRefs: strategyRef,
    microWins: strategyCompiled.gate.micro_wins
  })
  await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
  const ledgerRoot = await initializeAgentCentralLedger(dir, { missionId, roster, partition, route, prompt, dynamicScheduler: true })
  await writeAgentTaskGraph(ledgerRoot, partition.task_graph)
  await writeAdhdOrchestrationArtifacts(ledgerRoot, strategyCompiled.gate)
  await writeStrategyCompilerArtifacts(ledgerRoot, strategyCompiled)
  await writeStrategyGateArtifact(ledgerRoot, strategyGate)
  await writeIntelligentWorkGraphArtifacts(ledgerRoot, partition.intelligent_work_graph)
  await writeScoutPolicyArtifact(ledgerRoot)
  await writeTmuxRightLaneCockpit(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, agents: roster.roster })
  await initializeTmuxLaneSupervisor(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, targetActiveSlots, launchRealTmux: realTmux })
  await writeTmuxPhysicalProof(ledgerRoot, { missionId, realTmux, required: realTmuxProofRequired, phase: 'initial' })
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
    desired_work_items: desiredWorkItemCount,
    minimum_work_items: minimumWorkItems,
    requested_work_items: desiredWorkItemCount,
    total_work_items: partition.task_graph?.total_work_items || partition.slices.length,
    backpressure: 'dynamic scheduler maintains target active slots until the work queue drains',
    rate_limit_delay_ms: backend === 'codex-exec' ? 250 : 0,
    resource_pressure_warnings: roster.agent_count > roster.concurrency ? ['agents_exceed_concurrency_batches'] : []
  })
  const parallelWritePolicy = {
    schema: 'sks.agent-parallel-write-policy.v1',
    generated_at: nowIso(),
    route,
    route_command: routeCommand,
    write_mode: opts.writeMode || 'off',
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
  await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: 'AGENT_NATIVE_KERNEL_RUNNING', route_command: routeCommand, native_agent_backend: backend })
  const scheduler = await runAgentScheduler({
    root: ledgerRoot,
    missionId,
    rootHash: namespace.root_hash,
    roster,
    partition,
    prompt,
    targetActiveSlots,
    ...(opts.maxQueueExpansion === undefined ? {} : { maxQueueExpansion: opts.maxQueueExpansion }),
    ...(opts.refillDelayMs === undefined ? {} : { refillDelayMs: opts.refillDelayMs }),
    sourceIntelligenceRefs: sourceIntelligenceRef,
    goalModeRef,
    launchSession: async ({ agent, workItem }) => {
      const slice = workItem.slice || { id: workItem.id, description: workItem.description || prompt }
      await openAgentSession(ledgerRoot, agent)
      await heartbeatAgentSession(ledgerRoot, agent)
      await appendAgentCodexCockpitHookEvent(dir, {
        hook_event_name: 'SubagentStart',
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
        real: backend === 'process' || (backend === 'codex-exec' && opts.real === true) || backend === 'tmux',
        slotId: agent.slot_id,
        generationIndex: agent.generation_index,
        requireGeneration: true
      })
      const result = await runAgentByBackend(backend, agent, slice, { ...opts, missionId, agentRoot: ledgerRoot, cwd: root, route, prompt })
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
        hook_event_name: 'SubagentStop',
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
      const paneBySlot = await readTmuxPaneIdsBySlot(ledgerRoot)
      const enrichedSlots = slots.map((slot) => ({ ...slot, pane_id: paneBySlot.get(slot.slot_id) || null, launch_status: paneBySlot.has(slot.slot_id) ? 'launched' : slot.status }))
      await writeTmuxRightLaneCockpit(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, slots: enrichedSlots })
      await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
      if (['session_completed', 'backfill_event', 'scheduler_drained'].includes(String(event.event_type))) {
        const periodicJanitor = await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
        if (!periodicJanitor.ok) await appendAgentLedgerEvent(ledgerRoot, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'periodic_janitor_blocked', payload: periodicJanitor })
      }
      if (String(event.event_type) === 'scheduler_draining') {
        await verifyTmuxLaneSurvival(ledgerRoot)
        await writeTmuxPhysicalProof(ledgerRoot, { missionId, realTmux, required: realTmuxProofRequired, phase: 'before_drain' })
      }
      await updateTmuxLaneSupervisorFromSlots(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, slots, state, event })
      if (String(event.event_type) === 'scheduler_drained') {
        await drainTmuxLaneSupervisor(ledgerRoot)
        await writeTmuxPhysicalProof(ledgerRoot, { missionId, realTmux, required: realTmuxProofRequired, phase: 'after_drain' })
      }
    }
  })
  const results = scheduler.results
  const stale = await detectStaleAgentSessions(ledgerRoot)
  if (!stale.ok) await appendAgentLedgerEvent(ledgerRoot, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'stale_sessions_detected', payload: stale })
  const timeoutKill = await killTimedOutAgentSessions(ledgerRoot)
  const recursion = await writeAgentRecursionGuardReport(ledgerRoot, results)
  const consensus = await writeAgentConsensus(ledgerRoot, results)
  const outputValidation = await writeAgentOutputValidationReport(ledgerRoot, results)
  const outputTails = await writeAgentOutputTailReport(ledgerRoot, results)
  const backendReport = await writeAgentBackendReport(ledgerRoot, { backend, results, outputTails })
  const finalPaneBySlot = await readTmuxPaneIdsBySlot(ledgerRoot)
  const finalTmuxSlots = scheduler.slots.map((slot: any) => ({ ...slot, pane_id: finalPaneBySlot.get(slot.slot_id) || null, launch_status: finalPaneBySlot.has(slot.slot_id) ? 'launched' : slot.status }))
  await writeTmuxRightLaneCockpit(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, slots: finalTmuxSlots })
  await writeTmuxPhysicalProof(ledgerRoot, { missionId, realTmux, required: realTmuxProofRequired, phase: 'final' })
  await compactAgentLedger(ledgerRoot)
  const cleanup = await writeAgentCleanupReport(ledgerRoot)
  const janitor = await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
  const blockers = [
    ...results.flatMap((result: any) => result.blockers || []),
    ...(stale.ok ? [] : stale.stale_sessions.map((id: string) => 'stale_heartbeat:' + id)),
    ...(timeoutKill.killed_sessions || []).map((id: string) => 'timeout_killed:' + id),
    ...(recursion.ok ? [] : recursion.violations.map((id: string) => 'recursion:' + id)),
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
    requestedWorkItems: desiredWorkItemCount,
    minimumWorkItems,
    targetActiveSlots,
    realParallel: backend === 'codex-exec' && opts.mock !== true,
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
    strategyGate
  })
  await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
  await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: proof.ok ? 'AGENT_NATIVE_KERNEL_DONE' : 'AGENT_NATIVE_KERNEL_BLOCKED', native_agent_backend: backend, updated_at: nowIso() })
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
    requested_work_items: desiredWorkItemCount,
    actual_total_work_items: partition.task_graph?.total_work_items || partition.slices.length,
    target_active_slots: targetActiveSlots,
    minimum_work_items: minimumWorkItems,
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
    proof
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

function isWriteCapableRun(opts: AgentRunOptions) {
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
  const concurrency = normalizeAgentConcurrency(opts.concurrency ?? input?.concurrency ?? agentCount, agentCount)
  const personas = Array.isArray(input?.personas) ? input.personas : sourceRows
  const roster = sourceRows.map((entry: any, index: number) => {
    const readOnly = opts.readonly === true || entry.read_only === true
    const id = String(entry.id || entry.agent_id || `agent_${index + 1}`)
    return {
      id,
      session_id: String(entry.session_id || `${id}-session-${String(index + 1).padStart(2, '0')}`),
      persona_id: String(entry.persona_id || id),
      role: String(entry.role || 'verifier'),
      index: index + 1,
      write_policy: String(entry.write_policy || (readOnly ? 'read-only' : 'route-local-artifact')),
      status: 'pending',
      reasoning_effort: entry.reasoning_effort || entry.model_reasoning_effort || (readOnly ? 'high' : 'medium'),
      model_reasoning_effort: entry.model_reasoning_effort || entry.reasoning_effort || (readOnly ? 'high' : 'medium'),
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
    max_agents: Math.max(agentCount, 20),
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
  if (backend === 'process') return runProcessAgent(agent, slice, opts)
  if (backend === 'codex-exec') {
    const writeLeaseRequested = Array.isArray(slice?.write_paths) && slice.write_paths.length > 0
    const workspaceWrite = opts.workspaceWrite === true || (opts.readonly !== true && opts.writeMode && opts.writeMode !== 'off' && writeLeaseRequested)
    return runCodexExecAgent(agent, slice, { ...opts, workspaceWrite, dryRun: opts.real === true ? false : true })
  }
  if (backend === 'tmux') return runTmuxAgent(agent, slice, opts)
  return runFakeAgent(agent, slice, opts)
}

async function readTmuxPaneIdsBySlot(root: string) {
  const out = new Map<string, string>()
  const text = await readText(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), '')
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
    result_count: (input.results || []).length,
    output_tail_report: 'agent-output-tails.json',
    records: (input.results || []).map((result: any) => ({
      agent_id: result.agent_id || null,
      session_id: result.session_id || null,
      backend: result.backend || input.backend || null,
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

import path from 'node:path';
import { appendJsonlBounded, exists, nowIso, readJson, sksRoot, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { initProject } from '../init.js';
import { createMission, loadMission, setCurrent } from '../mission.js';
import { buildQuestionSchema, writeQuestions } from '../questions.js';
import { CODEX_COMPUTER_USE_ONLY_POLICY, CODEX_WEB_VERIFICATION_POLICY, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, ROUTES, hasFromChatImgSignal, routePrompt, routeReasoning, triwikiContextTracking } from '../routes.js';
import { TEAM_DECOMPOSITION_ARTIFACT, TEAM_GRAPH_ARTIFACT, TEAM_INBOX_DIR, TEAM_RUNTIME_TASKS_ARTIFACT, teamRuntimePlanMetadata, teamRuntimeRequiredArtifacts, writeTeamRuntimeArtifacts } from '../team-dag.js';
import { SSOT_GUARD_ARTIFACT, buildSsotGuard, ssotGuardPolicyText } from '../safety/ssot-guard.js';
import { appendTeamEvent, formatAgentReasoning, formatRoleCounts, initTeamLive, isTerminalTeamAgentStatus, normalizeTeamSpec, parseTeamSpecArgs, readTeamControl, readTeamDashboard, readTeamLive, readTeamTranscriptTail, renderTeamAgentLane, renderTeamCleanupSummary, renderTeamWatch, requestTeamSessionCleanup, teamCleanupRequested, teamReasoningPolicy } from '../team-live.js';
import { evaluateTeamReviewPolicyGate, MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_POLICY_TEXT, teamReviewPolicy } from '../team-review-policy.js';
import { ARTIFACT_FILES } from '../artifact-schemas.js';
import { writeEffortDecision } from '../effort-orchestrator.js';
import { createWorkOrderLedger, writeWorkOrderLedger } from '../work-order-ledger.js';
import { writeFromChatImgArtifacts } from '../from-chat-img-forensics.js';
import { renderTeamDashboardState, writeTeamDashboardState } from '../team-dashboard-renderer.js';
import { PIPELINE_PLAN_ARTIFACT, validatePipelinePlan, writePipelinePlan } from '../pipeline.js';
import { attachZellijSessionInteractive, launchTeamZellijView } from '../zellij/zellij-launcher.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { runNativeAgentOrchestrator } from '../agents/agent-orchestrator.js';
import { ambientGoalContinuation, flag, readBoundedIntegerFlag, readFlagValue } from './command-utils.js';

const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json';

export async function team(args: any = []) {
  const teamSubcommands = new Set(['log', 'tail', 'watch', 'lane', 'status', 'dashboard', 'event', 'message', 'open-zellij', 'attach-zellij', 'cleanup-zellij', 'open-tmux', 'attach-tmux', 'cleanup-tmux']);
  if (teamSubcommands.has(args[0])) return teamCommand(args[0], args.slice(1));
  const jsonOutput = flag(args, '--json');
  const mock = flag(args, '--mock');
  const openZellij = !mock && !jsonOutput && !flag(args, '--no-open-zellij') && !flag(args, '--no-zellij');
  const cleanCreateArgs = args.filter((arg: any) => !['--open-zellij', '--zellij-open', '--no-open-zellij', '--no-zellij', '--no-attach', '--mock'].includes(String(arg)));
  const opts = parseTeamCreateArgs(cleanCreateArgs);
  const { prompt, agentSessions, roleCounts, roster } = opts;
  const targetActiveSlots = readBoundedIntegerFlag(args, '--target-active-slots', roster.bundle_size, 1, 20);
  const visualLaneCount = roster.bundle_size;
  const desiredWorkItemCount = readBoundedIntegerFlag(args, '--work-items', targetActiveSlots, 1, 200);
  const minimumWorkItems = readBoundedIntegerFlag(args, '--minimum-work-items', targetActiveSlots, 1, 200);
  const maxQueueExpansion = readBoundedIntegerFlag(args, '--max-queue-expansion', 10, 0, 200);
  const profile = readFlagValue(args, '--profile', '') || null;
  const writeMode = readFlagValue(args, '--write-mode', flag(args, '--parallel-write') ? 'parallel' : 'off');
  const applyPatches = flag(args, '--apply-patches');
  const dryRunPatches = flag(args, '--dry-run-patches') || flag(args, '--dryrun-patches');
  const maxWriteAgents = readBoundedIntegerFlag(args, '--max-write-agents', Math.min(roster.bundle_size, 5), 1, 20);
  if (!prompt) {
    console.error('Usage: sks team "task" [20:agents] [executor:5 reviewer:6 user:1] [--agents N] [--work-items N] [--target-active-slots N] [--profile NAME] [--write-mode off|proof-safe|parallel|serial] [--apply-patches] [--no-open-zellij] [--json] [--mock]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const { id, dir } = await createMission(root, { mode: 'team', prompt });
  const schema = buildQuestionSchema(prompt);
  await writeQuestions(dir, schema);
  const plan = buildTeamPlan(id, prompt, { agentSessions, roleCounts, roster, targetActiveSlots });
  await writeJsonAtomic(path.join(dir, 'team-plan.json'), plan);
  await writeJsonAtomic(path.join(dir, SSOT_GUARD_ARTIFACT), plan.ssot_guard);
  await writeTextAtomic(path.join(dir, 'team-workflow.md'), teamWorkflowMarkdown(plan));
  const liveFiles = await initTeamLive(id, dir, prompt, { agentSessions, roleCounts, roster });
  await writeJsonAtomic(path.join(dir, 'team-roster.json'), { schema_version: 1, mission_id: id, role_counts: roleCounts, agent_sessions: agentSessions, bundle_size: roster.bundle_size, roster, confirmed: true, source: 'default_or_prompt_team_spec' });
  const fromChatImgRequired = hasFromChatImgSignal(prompt);
  const teamReasoning = teamReasoningPolicy(prompt, roster);
  const promptEffort = teamReasoning.prompt_policy?.effort || 'medium';
  const runtime = await writeTeamRuntimeArtifacts(dir, plan, {});
  const effortDecision = await writeEffortDecision(dir, {
    mission_id: id,
    task_id: 'TEAM-INTAKE',
    route: fromChatImgRequired ? 'from-chat-img' : 'team',
    prompt,
    tool_use: promptEffort === 'medium',
    multi_step_decision: promptEffort !== 'low',
    spans_many_files: promptEffort === 'high' || promptEffort === 'xhigh',
    is_deterministic: promptEffort === 'low',
    has_verified_skill: true,
    high_risk: promptEffort === 'high' || promptEffort === 'xhigh',
    risk_scores: {
      security: /security|auth|permission|database|supabase|sql|보안|권한|데이터베이스/i.test(prompt) ? 0.8 : 0.1,
      destructive_action: /delete|drop|reset|remove|삭제|초기화/i.test(prompt) ? 0.8 : 0.1,
      user_impact: /release|publish|deploy|commit|push|production|배포|커밋|푸쉬|운영/i.test(prompt) ? 0.8 : 0.3
    }
  });
  const workOrder = createWorkOrderLedger({ missionId: id, route: fromChatImgRequired ? 'from-chat-img' : 'team', sourcesComplete: !fromChatImgRequired, requests: [{ verbatim: prompt, normalized_requirement: prompt, implementation_tasks: ['TASK-001'], status: 'pending' }] });
  await writeWorkOrderLedger(dir, workOrder);
  if (fromChatImgRequired) await writeFromChatImgArtifacts(dir, { missionId: id, requests: [{ verbatim: prompt }], ambiguities: ['image source inventory must be completed before implementation'] });
  let liveZellij: any = null;
  if (!mock && openZellij) {
    liveZellij = await launchTeamZellijView({ root, missionId: id, ledgerRoot: path.join(dir, 'agents'), slotCount: visualLaneCount, dryRun: false, attach: false });
    if (liveZellij?.ok && liveZellij.capability?.status === 'ok') console.log(`Zellij: prepared ${visualLaneCount} native agent lane(s) in ${liveZellij.session_name}. Attach with: ${liveZellij.attach_command_with_env || liveZellij.attach_command}`);
    else if (liveZellij?.ok) console.log(`Zellij: optional live panes unavailable (${(liveZellij.warnings || []).join('; ') || liveZellij.capability?.status || 'unknown'}).`);
    else console.log(`Zellij: blocked (${Array.from(new Set(liveZellij?.blockers || [])).join('; ')})`);
  }
  const nativeAgentRun = await runNativeAgentOrchestrator({
    root,
    missionId: id,
    route: '$Team',
    prompt,
    backend: mock ? 'fake' : 'codex-sdk',
    mock,
    agents: roster.bundle_size,
    targetActiveSlots,
    visualLaneCount,
    desiredWorkItemCount,
    minimumWorkItems,
    maxQueueExpansion,
    concurrency: Math.min(agentSessions, roster.bundle_size),
    readonly: !applyPatches && writeMode === 'off',
    profile,
    writeMode: writeMode as any,
    applyPatches,
    dryRunPatches,
    maxWriteAgents,
    routeCommand: 'sks team',
    routeBlackboxKind: 'actual_team_command'
  });
  await appendTeamEvent(dir, {
    agent: 'native_agent_orchestrator',
    phase: 'native_agent_intake',
    type: nativeAgentRun.ok ? 'complete' : 'blocked',
    artifact: 'agents/agent-proof-evidence.json',
    message: 'Native agent orchestrator completed with ' + nativeAgentRun.backend + ' backend; proof ' + (nativeAgentRun.proof?.status || 'unknown') + '.'
  });
  let dashboardState = await writeTeamDashboardState(dir, { missionId: id, mission: { id, mode: 'team' }, effort: effortDecision.selected_effort, phase: 'intake', next_action: fromChatImgRequired ? 'complete visual source inventory and work-order mapping' : 'run Team native agent intake agents' });
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), { passed: false, team_roster_confirmed: true, native_agent_proof: nativeAgentRun.proof?.ok === true, agent_central_ledger: true, analysis_artifact: false, triwiki_refreshed: false, triwiki_validated: false, ssot_guard: false, consensus_artifact: false, ...runtime.gate_fields, implementation_team_fresh: false, review_artifact: false, integration_evidence: false, session_cleanup: false, context7_evidence: false, ...(fromChatImgRequired ? { from_chat_img_required: true, from_chat_img_request_coverage: false } : {}) });
  dashboardState = await writeTeamDashboardState(dir, { missionId: id, mission: { id, mode: 'team' }, effort: effortDecision.selected_effort, phase: 'intake', next_action: fromChatImgRequired ? 'complete visual source inventory and work-order mapping' : 'run Team native agent intake agents' });
  const route = routePrompt(`$Team ${prompt}`) || ROUTES.find((candidate: any) => candidate.id === 'Team');
  const routeReason = routeReasoning(route, prompt);
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task: prompt, required: false, ambiguity: { required: false, status: 'team_cli_direct' } });
  await setCurrent(root, { mission_id: id, route: 'Team', route_command: '$Team', mode: 'TEAM', phase: mock ? 'TEAM_FIXTURE_DONE' : 'TEAM_NATIVE_AGENT_INTAKE', questions_allowed: false, implementation_allowed: true, context7_required: false, context7_verified: mock, subagents_required: false, subagents_verified: true, native_sessions_required: true, native_sessions_verified: nativeAgentRun.proof?.ok === true, reflection_required: true, visible_progress_required: true, context_tracking: 'triwiki', required_skills: route?.requiredSkills || ['team'], stop_gate: 'team-gate.json', reasoning_effort: routeReason.effort, reasoning_profile: routeReason.profile, reasoning_temporary: true, team_agent_reasoning_policy: teamReasoning, goal_continuation: pipelinePlan.goal_continuation, agent_sessions: agentSessions, target_active_slots: targetActiveSlots, role_counts: roleCounts, team_roster_confirmed: true, team_graph_ready: runtime.ok, team_live_ready: true, from_chat_img_required: fromChatImgRequired, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT, native_agent_backend: nativeAgentRun.backend, native_agent_proof: 'agents/agent-proof-evidence.json', prompt });
  const result: any = {
    mission_id: id,
    mission_dir: dir,
    plan: path.join(dir, 'team-plan.json'),
    workflow: path.join(dir, 'team-workflow.md'),
    team_graph: path.join(dir, TEAM_GRAPH_ARTIFACT),
    runtime_tasks: path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT),
    decomposition_report: path.join(dir, TEAM_DECOMPOSITION_ARTIFACT),
    worker_inbox_dir: path.join(dir, TEAM_INBOX_DIR),
    live: liveFiles.live,
    transcript: liveFiles.transcript,
    dashboard: liveFiles.dashboard,
    dashboard_state: path.join(dir, ARTIFACT_FILES.team_dashboard_state),
    effort_decision: path.join(dir, ARTIFACT_FILES.effort_decision),
    work_order_ledger: path.join(dir, ARTIFACT_FILES.work_order_ledger),
    pipeline_plan: path.join(dir, PIPELINE_PLAN_ARTIFACT),
    dashboard_state_valid: dashboardState.ok,
    context_pack: path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'),
    agent_sessions: agentSessions,
    bundle_size: roster.bundle_size,
    target_active_slots: targetActiveSlots,
    visual_lane_count: visualLaneCount,
    desired_work_items: desiredWorkItemCount,
    minimum_work_items: minimumWorkItems,
    max_queue_expansion: maxQueueExpansion,
    role_counts: roleCounts,
    questions: path.join(dir, 'questions.md'),
    native_agent_run: nativeAgentRun,
    codex_agents: ['native_agent_orchestrator', 'agent_central_ledger', 'agent_proof_evidence', 'agent_review_lane', 'agent_integration_lane']
  };
  if (mock) {
    await writeTextAtomic(path.join(dir, 'team-analysis.md'), `# Team Native Agent Analysis\n\nMock Team fixture completed native agent intake for ${id}.\n`);
    await writeTextAtomic(path.join(dir, 'team-consensus.md'), `# Team Consensus\n\nMock Team fixture consensus reached for ${id}.\n`);
    await writeTextAtomic(path.join(dir, 'team-review.md'), `# Team Review\n\nMock Team fixture review completed with ${MIN_TEAM_REVIEWER_LANES} validation lanes for ${id}.\n`);
    await writeTextAtomic(path.join(dir, 'context7-evidence.jsonl'), `${JSON.stringify({ schema: 'sks.context7-evidence.v1', mission_id: id, route: '$Team', status: 'mock_not_required', generated_at: nowIso() })}\n`);
    const cleanup = { schema_version: 1, mission_id: id, status: 'clean', passed: true, all_sessions_closed: true, outstanding_sessions: 0, live_transcript_finalized: true, mock: true, generated_at: nowIso() };
    await writeJsonAtomic(path.join(dir, TEAM_SESSION_CLEANUP_ARTIFACT), cleanup);
    const gate = { passed: true, team_roster_confirmed: true, native_agent_proof: nativeAgentRun.proof?.ok === true, agent_central_ledger: true, analysis_artifact: true, triwiki_refreshed: true, triwiki_validated: true, ssot_guard: true, consensus_artifact: true, ...runtime.gate_fields, implementation_team_fresh: true, review_artifact: true, review_lanes: MIN_TEAM_REVIEWER_LANES, integration_evidence: true, session_cleanup: true, context7_evidence: true, mock: true };
    await writeJsonAtomic(path.join(dir, 'team-gate.json'), gate);
    const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$Team', gateFile: 'team-gate.json', gate, mock: true, statusHint: 'verified_partial', artifacts: ['agents/agent-proof-evidence.json', SSOT_GUARD_ARTIFACT, 'team-gate.json', TEAM_SESSION_CLEANUP_ARTIFACT, 'team-plan.json', 'team-runtime-tasks.json', 'completion-proof.json'], claims: [{ id: 'team-fixture-complete', status: 'verified_partial' }], command: { cmd: `sks team "${prompt}" --mock`, status: 0 } });
    result.mock = true;
    result.proof = proof.validation;
  } else {
    result.zellij = liveZellij || await launchTeamZellijView({ root, missionId: id, ledgerRoot: path.join(dir, 'agents'), slotCount: visualLaneCount, dryRun: jsonOutput || !openZellij, attach: false });
    if (openZellij && result.zellij?.ok && result.zellij.capability?.status === 'ok' && shouldAutoAttachTeamZellij(args)) {
      attachZellijSessionInteractive(result.zellij.session_name, { cwd: root, configPath: result.zellij.clipboard_config_path });
    }
  }
  if (jsonOutput) return console.log(JSON.stringify(result, null, 2));
  console.log(`Team mission created: ${id}`);
  console.log(`Agent sessions: ${agentSessions}`);
  console.log(`Role counts: ${formatRoleCounts(roleCounts)}`);
  console.log(`Review policy: minimum ${MIN_TEAM_REVIEWER_LANES} reviewer/QA validation lanes`);
  if (result.zellij?.ok && result.zellij.capability?.status === 'ok') console.log(`Zellij: prepared ${visualLaneCount} native agent lane(s) in ${result.zellij.session_name}`);
  else if (result.zellij?.ok) console.log(`Zellij: optional live panes unavailable (${(result.zellij.warnings || []).join('; ') || result.zellij.capability?.status || 'unknown'})`);
  else if (!mock) console.log(`Zellij: blocked (${Array.from(new Set(result.zellij?.blockers || [])).join('; ')})`);
  console.log(`Watch: sks team watch ${id}`);
  console.log(`Artifacts: .sneakoscope/missions/${id}`);
}

export function parseTeamCreateArgs(args: any) {
  const spec = parseTeamSpecArgs(args);
  const prompt = spec.cleanArgs.join(' ').trim();
  const normalized = normalizeTeamSpec({ agentSessions: spec.agentSessions, roleCounts: spec.roleCounts, prompt });
  return { prompt, agentSessions: normalized.agentSessions, roleCounts: normalized.roleCounts, roster: normalized.roster };
}

export function buildTeamPlan(id: any, prompt: any, opts: any = {}) {
  const spec = normalizeTeamSpec({ ...opts, prompt });
  const { agentSessions, roleCounts, roster } = spec;
  const fromChatImgRequired = hasFromChatImgSignal(prompt);
  const ssotGuard = buildSsotGuard({ route: 'Team', mode: 'TEAM', task: prompt });
  const requiredArtifacts = ['team-roster.json', 'work-order-ledger.json', 'effort-decision.json', 'team-dashboard-state.json', 'agents/agent-proof-evidence.json', 'team-analysis.md', ...(fromChatImgRequired ? [FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT] : []), SSOT_GUARD_ARTIFACT, 'team-consensus.md', ...teamRuntimeRequiredArtifacts(), 'team-review.md', 'team-gate.json', TEAM_SESSION_CLEANUP_ARTIFACT, 'team-live.md', 'team-transcript.jsonl', 'team-dashboard.json', '.sneakoscope/wiki/context-pack.json', 'context7-evidence.jsonl'];
  return {
    schema_version: 1,
    mission_id: id,
    mode: 'team',
    prompt,
    agent_session_count: agentSessions,
    default_agent_session_count: MIN_TEAM_REVIEWER_LANES,
    target_active_slots: opts.targetActiveSlots || agentSessions,
    role_counts: roleCounts,
    session_policy: `Use at most ${opts.targetActiveSlots || agentSessions} native multi-session lanes at a time; parent orchestrator is not counted.`,
    review_policy: teamReviewPolicy(),
    review_gate: evaluateTeamReviewPolicyGate({ roleCounts, agentSessions, roster }),
    bundle_size: roster.bundle_size,
    roster,
    goal_continuation: ambientGoalContinuation(),
    team_model: {
      phases: ['native_agent_intake', 'triwiki_stage_refresh', 'debate_team', 'triwiki_stage_refresh', 'runtime_task_graph', 'development_team', 'triwiki_stage_refresh', 'review', 'session_cleanup'],
      analysis_team: `Read-only native analysis with exactly ${roster.bundle_size} native_agent_N agents.`,
      debate_team: `Read-only role debate with exactly ${roster.bundle_size} participants.`,
      development_team: `Fresh parallel development bundle with exactly ${roster.bundle_size} executor_N developers implementing disjoint slices.`,
      review_team: `Validation runs at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA lanes before integration or final.`
    },
    team_runtime: teamRuntimePlanMetadata(),
    persona_axioms: [
      'Final users are intentionally low-context, impatient, self-interested, stubborn, and hostile to inconvenience.',
      'Executors are capable developers and must receive disjoint write ownership.',
      'Reviewers are strict, skeptical, and block unsupported correctness, DB safety, test, or evidence claims.',
      MIN_TEAM_REVIEW_POLICY_TEXT
    ],
    reasoning: teamReasoningPolicy(prompt, roster),
    ssot_guard: ssotGuard,
    context_tracking: triwikiContextTracking(),
    phases: [
      { id: 'team_roster_confirmation', goal: 'Materialize Team roster and write team-roster.json.', agents: ['parent_orchestrator'], output: 'team-roster.json' },
      { id: 'native_agent_intake', goal: fromChatImgRequired ? `Complete From-Chat-IMG source inventory and coverage artifacts. Web/browser/webapp screenshots require Codex Chrome Extension readiness first; native Mac/non-web surfaces may use Codex Computer Use. ${CODEX_WEB_VERIFICATION_POLICY} ${CODEX_COMPUTER_USE_ONLY_POLICY}` : 'Read relevant TriWiki context and run read-only native agent intake agents before debate.', agents: roster.analysis_team.map((agent: any) => agent.id), max_parallel_native_sessions: opts.targetActiveSlots || agentSessions, write_policy: 'read-only', output: 'team-analysis.md' },
      { id: 'triwiki_refresh', goal: 'Refresh and validate TriWiki from agent intake findings.', agents: ['parent_orchestrator'], commands: ['sks wiki refresh', 'sks wiki validate .sneakoscope/wiki/context-pack.json'], output: '.sneakoscope/wiki/context-pack.json' },
      { id: 'ssot_guard', goal: ssotGuardPolicyText(), agents: ['parent_orchestrator'], output: SSOT_GUARD_ARTIFACT },
      { id: 'planning_debate', goal: 'Debate risks and viable approaches with refreshed context.', agents: roster.debate_team.map((agent: any) => agent.id), max_parallel_native_sessions: opts.targetActiveSlots || agentSessions, write_policy: 'read-only' },
      { id: 'runtime_task_graph_compile', goal: `Compile ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, and ${TEAM_DECOMPOSITION_ARTIFACT}.`, agents: ['parent_orchestrator'] },
      { id: 'parallel_implementation', goal: 'Fresh executor developers implement disjoint slices.', agents: roster.development_team.map((agent: any) => agent.id), max_parallel_native_sessions: opts.targetActiveSlots || agentSessions, write_policy: 'workspace-write with explicit ownership' },
      { id: 'review_and_integrate', goal: `Review with at least ${MIN_TEAM_REVIEWER_LANES} independent lanes.`, agents: roster.validation_team.map((agent: any) => agent.id).concat(['parent_orchestrator']), min_reviewer_lanes: MIN_TEAM_REVIEWER_LANES },
      { id: 'session_cleanup', goal: `Write ${TEAM_SESSION_CLEANUP_ARTIFACT}.`, agents: ['parent_orchestrator'], output: TEAM_SESSION_CLEANUP_ARTIFACT }
    ],
    invariants: ['The parent thread remains the orchestrator and owns final integration.', 'Native agent intake are read-only.', 'Implementation workers receive disjoint ownership scopes.', 'SSOT guard blocks source-of-truth drift before implementation and final gate pass.', MIN_TEAM_REVIEW_POLICY_TEXT],
    live_visibility: { markdown: 'team-live.md', transcript: 'team-transcript.jsonl', dashboard: 'team-dashboard.json' },
    required_artifacts: requiredArtifacts,
    prompt_command: fromChatImgRequired ? '$From-Chat-IMG' : '$Team'
  };
}

export function teamWorkflowMarkdown(plan: any) {
  const ctx = plan.context_tracking || triwikiContextTracking();
  return `# SKS Team Mission

Mission: ${plan.mission_id}

Prompt:
${plan.prompt}

## Codex App Prompt

\`\`\`text
${plan.prompt_command || '$Team'} ${plan.prompt}

Use at most ${plan.target_active_slots || plan.agent_session_count || MIN_TEAM_REVIEWER_LANES} native multi-session lanes at a time; the parent orchestrator is not counted. ${plan.review_policy?.text || MIN_TEAM_REVIEW_POLICY_TEXT}
\`\`\`

## Context Tracking

- SSOT: ${ctx.ssot}
- Pack: ${ctx.default_pack}
- Refresh: \`${ctx.pack_command}\`
- Validate: \`${ctx.validate_command}\`

## Analysis Agents

${plan.roster.analysis_team.map((agent: any) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Debate Team

${plan.roster.debate_team.map((agent: any) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Development Team

${plan.roster.development_team.map((agent: any) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Validation Team

${plan.roster.validation_team.map((agent: any) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Phases

${plan.phases.map((phase: any, idx: any) => `${idx + 1}. ${phase.id}: ${phase.goal}`).join('\n')}

## Invariants

${plan.invariants.map((x: any) => `- ${x}`).join('\n')}
`;
}

async function teamCommand(sub: any, args: any) {
  const root = await sksRoot();
  const missionArg = args[0] && !String(args[0]).startsWith('--') ? args[0] : 'latest';
  const { resolveMissionId } = await import('./command-utils.js');
  const id = await resolveMissionId(root, missionArg);
  if (!id) {
    console.error(`Usage: sks team ${sub} [mission-id|latest]`);
    process.exitCode = 1;
    return;
  }
  const { dir } = await loadMission(root, id);
  if (sub === 'open-tmux' || sub === 'attach-tmux' || sub === 'cleanup-tmux') {
    const result = { ok: false, status: 'removed_runtime', runtime: 'tmux', replacement: 'zellij', operator_actions: ['Use `sks team open-zellij`, `attach-zellij`, or `cleanup-zellij`.'] };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.error('tmux runtime has been removed from SKS Team. Use Zellij commands instead.');
    process.exitCode = 2;
    return;
  }
  if (sub === 'open-zellij' || sub === 'attach-zellij') {
    const plan = await readJson(path.join(dir, 'team-plan.json'), null);
    if (!plan) {
      console.error(`Team plan missing for ${id}; cannot open Zellij Team view.`);
      process.exitCode = 2;
      return;
    }
    const slotCount = await inferTeamZellijSlotCount(dir, plan);
    const zellij = await launchTeamZellijView({ root, missionId: id, ledgerRoot: path.join(dir, 'agents'), slotCount, dryRun: flag(args, '--json'), attach: false });
    if (flag(args, '--json')) return console.log(JSON.stringify(zellij, null, 2));
    if (!zellij.ok) {
      console.error(`Zellij Team view blocked for ${id}: ${(zellij.blockers || []).join('; ') || 'Zellij launch failed'}`);
      process.exitCode = 2;
      return;
    }
    if (zellij.capability?.status === 'ok') console.log(`Zellij: prepared Team lane(s) in ${zellij.session_name}`);
    else console.log(`Zellij: optional live panes unavailable (${(zellij.warnings || []).join('; ') || zellij.capability?.status || 'unknown'})`);
    if (zellij.capability?.status === 'ok' && (sub === 'attach-zellij' || shouldAutoAttachTeamZellij(args))) {
      attachZellijSessionInteractive(zellij.session_name, { cwd: root, configPath: zellij.clipboard_config_path });
    }
    return;
  }
  if (sub === 'event') {
    const message = readFlagValue(args, '--message', '');
    if (!message) {
      console.error('Usage: sks team event [mission-id|latest] --agent <name> --phase <phase> --message "..."');
      process.exitCode = 1;
      return;
    }
    const phase = readFlagValue(args, '--phase', 'general');
    const plan = await readJson(path.join(dir, 'team-plan.json'), null).catch(() => null);
    const record = await appendTeamEvent(dir, { agent: readFlagValue(args, '--agent', 'parent_orchestrator'), phase, type: readFlagValue(args, '--type', 'status'), artifact: readFlagValue(args, '--artifact', ''), message });
    if (flag(args, '--json')) return console.log(JSON.stringify(record, null, 2));
    console.log(`${record.ts} [${record.phase}] ${record.agent}: ${record.message}`);
    return;
  }
  if (sub === 'message') {
    const message = readFlagValue(args, '--message', '');
    if (!message) {
      console.error('Usage: sks team message [mission-id|latest] --from <agent> --to <agent|all> --message "..."');
      process.exitCode = 1;
      return;
    }
    const record = await appendTeamEvent(dir, { agent: readFlagValue(args, '--from', readFlagValue(args, '--agent', 'parent_orchestrator')), to: readFlagValue(args, '--to', 'all'), phase: readFlagValue(args, '--phase', 'communication'), type: 'message', message });
    if (flag(args, '--json')) return console.log(JSON.stringify(record, null, 2));
    console.log(`${record.ts} [${record.phase}] ${record.agent} -> ${record.to}: ${record.message}`);
    return;
  }
  if (sub === 'cleanup-zellij') {
    const control = await requestTeamSessionCleanup(dir, { missionId: id, agent: readFlagValue(args, '--agent', 'parent_orchestrator'), reason: readFlagValue(args, '--reason', 'Team session ended; clean up live follow panes.'), finalMessage: 'Team session ended.' });
    await appendTeamEvent(dir, { agent: readFlagValue(args, '--agent', 'parent_orchestrator'), phase: 'session_cleanup', type: 'cleanup', message: control.cleanup_reason || 'Team session cleanup requested.' });
    const cleanup = { ok: true, runtime: 'zellij', mission_id: id, control, close_requested: flag(args, '--close-session') || flag(args, '--close') };
    await writeJsonAtomic(path.join(dir, 'zellij-session-cleanup.json'), cleanup);
    if (flag(args, '--json')) return console.log(JSON.stringify(cleanup, null, 2));
    console.log('Zellij cleanup: marked complete.');
    console.log(renderTeamCleanupSummary(control));
    return;
  }
  if (sub === 'status') {
    const dashboard = await readTeamDashboard(dir);
    if (flag(args, '--json')) return console.log(JSON.stringify(dashboard || {}, null, 2));
    if (!dashboard) {
      console.error(`Team dashboard missing for ${id}.`);
      process.exitCode = 2;
      return;
    }
    console.log(`Team mission: ${id}`);
    console.log(`Updated: ${dashboard.updated_at || 'unknown'}`);
    console.log(`Agent sessions: ${dashboard.agent_session_count || MIN_TEAM_REVIEWER_LANES}`);
    if (dashboard.role_counts) console.log(`Role counts: ${formatRoleCounts(dashboard.role_counts)}`);
    return;
  }
  if (sub === 'dashboard') {
    await writeTeamDashboardState(dir, { missionId: id });
    const state = await readJson(path.join(dir, ARTIFACT_FILES.team_dashboard_state), {});
    if (flag(args, '--json')) return console.log(JSON.stringify(state, null, 2));
    console.log(renderTeamDashboardState(state));
    return;
  }
  if (sub === 'log') return console.log(await readTeamLive(dir));
  if (sub === 'lane') {
    const agent = readFlagValue(args, '--agent', 'parent_orchestrator');
    const phase = readFlagValue(args, '--phase', '');
    const lines = Number(readFlagValue(args, '--lines', '12'));
    const text = await renderTeamAgentLane(dir, { missionId: id, agent, phase, lines });
    if (flag(args, '--json')) return console.log(JSON.stringify({ mission_id: id, agent, phase, lane: text }, null, 2));
    console.log(text);
    if (flag(args, '--follow') && !teamCleanupRequested(await readTeamControl(dir)) && !isTerminalTeamAgentStatus((await readTeamDashboard(dir).catch(() => null))?.agents?.[agent]?.status || '')) {
      // Follow mode intentionally falls through only for interactive terminals in the full Zellij lane.
    }
    return;
  }
  if (sub === 'tail' || sub === 'watch') {
    const lines = readFlagValue(args, '--lines', '20');
    if (sub === 'watch' && !flag(args, '--raw')) console.log(await renderTeamWatch(dir, { missionId: id, lines: Number(lines) }));
    else for (const line of await readTeamTranscriptTail(dir, Number(lines))) console.log(line);
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

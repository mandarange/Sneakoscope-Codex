import path from 'node:path';
import { appendJsonlBounded, exists, nowIso, readJson, sksRoot, writeJsonAtomic, writeTextAtomic } from '../fsx.mjs';
import { initProject } from '../init.mjs';
import { createMission, loadMission, setCurrent } from '../mission.mjs';
import { buildQuestionSchema, writeQuestions } from '../questions.mjs';
import { CODEX_COMPUTER_USE_ONLY_POLICY, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, ROUTES, hasFromChatImgSignal, routePrompt, routeReasoning, triwikiContextTracking } from '../routes.mjs';
import { TEAM_DECOMPOSITION_ARTIFACT, TEAM_GRAPH_ARTIFACT, TEAM_INBOX_DIR, TEAM_RUNTIME_TASKS_ARTIFACT, teamRuntimePlanMetadata, teamRuntimeRequiredArtifacts, writeTeamRuntimeArtifacts } from '../team-dag.mjs';
import { appendTeamEvent, formatAgentReasoning, formatRoleCounts, initTeamLive, isTerminalTeamAgentStatus, normalizeTeamSpec, parseTeamSpecArgs, readTeamControl, readTeamDashboard, readTeamLive, readTeamTranscriptTail, renderTeamAgentLane, renderTeamCleanupSummary, renderTeamWatch, requestTeamSessionCleanup, teamCleanupRequested, teamReasoningPolicy } from '../team-live.mjs';
import { evaluateTeamReviewPolicyGate, MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_POLICY_TEXT, teamReviewPolicy } from '../team-review-policy.mjs';
import { ARTIFACT_FILES } from '../artifact-schemas.mjs';
import { writeEffortDecision } from '../effort-orchestrator.mjs';
import { createWorkOrderLedger, writeWorkOrderLedger } from '../work-order-ledger.mjs';
import { writeFromChatImgArtifacts } from '../from-chat-img-forensics.mjs';
import { renderTeamDashboardState, writeTeamDashboardState } from '../team-dashboard-renderer.mjs';
import { PIPELINE_PLAN_ARTIFACT, validatePipelinePlan, writePipelinePlan } from '../pipeline.mjs';
import { cleanupTmuxTeamView, launchTmuxTeamView, reconcileTmuxTeamCockpit } from '../tmux-ui.mjs';
import { maybeFinalizeRoute } from '../proof/auto-finalize.mjs';
import { ambientGoalContinuation, flag, readFlagValue } from './command-utils.mjs';

const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json';

export async function team(args = []) {
  const teamSubcommands = new Set(['log', 'tail', 'watch', 'lane', 'status', 'dashboard', 'event', 'message', 'open-tmux', 'attach-tmux', 'cleanup-tmux']);
  if (teamSubcommands.has(args[0])) return teamCommand(args[0], args.slice(1));
  const jsonOutput = flag(args, '--json');
  const mock = flag(args, '--mock');
  const openTmux = !mock && !jsonOutput && !flag(args, '--no-open-tmux') && !flag(args, '--no-tmux');
  const cleanCreateArgs = args.filter((arg) => !['--open-tmux', '--tmux-open', '--no-open-tmux', '--no-tmux', '--no-attach', '--mock'].includes(String(arg)));
  const opts = parseTeamCreateArgs(cleanCreateArgs);
  const { prompt, agentSessions, roleCounts, roster } = opts;
  if (!prompt) {
    console.error('Usage: sks team "task" [executor:5 reviewer:6 user:1] [--agents N] [--no-open-tmux] [--json] [--mock]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const { id, dir } = await createMission(root, { mode: 'team', prompt });
  const schema = buildQuestionSchema(prompt);
  await writeQuestions(dir, schema);
  const plan = buildTeamPlan(id, prompt, { agentSessions, roleCounts, roster });
  await writeJsonAtomic(path.join(dir, 'team-plan.json'), plan);
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
  let dashboardState = await writeTeamDashboardState(dir, { missionId: id, mission: { id, mode: 'team' }, effort: effortDecision.selected_effort, phase: 'intake', next_action: fromChatImgRequired ? 'complete visual source inventory and work-order mapping' : 'run Team analysis scouts' });
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), { passed: false, team_roster_confirmed: true, analysis_artifact: false, triwiki_refreshed: false, triwiki_validated: false, consensus_artifact: false, ...runtime.gate_fields, implementation_team_fresh: false, review_artifact: false, integration_evidence: false, session_cleanup: false, context7_evidence: false, ...(fromChatImgRequired ? { from_chat_img_required: true, from_chat_img_request_coverage: false } : {}) });
  dashboardState = await writeTeamDashboardState(dir, { missionId: id, mission: { id, mode: 'team' }, effort: effortDecision.selected_effort, phase: 'intake', next_action: fromChatImgRequired ? 'complete visual source inventory and work-order mapping' : 'run Team analysis scouts' });
  const route = routePrompt(`$Team ${prompt}`) || ROUTES.find((candidate) => candidate.id === 'Team');
  const routeReason = routeReasoning(route, prompt);
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task: prompt, required: false, ambiguity: { required: false, status: 'team_cli_direct' } });
  await setCurrent(root, { mission_id: id, route: 'Team', route_command: '$Team', mode: 'TEAM', phase: mock ? 'TEAM_FIXTURE_DONE' : 'TEAM_PARALLEL_ANALYSIS_SCOUTING', questions_allowed: false, implementation_allowed: true, context7_required: false, context7_verified: mock, subagents_required: true, subagents_verified: mock, reflection_required: true, visible_progress_required: true, context_tracking: 'triwiki', required_skills: route?.requiredSkills || ['team'], stop_gate: 'team-gate.json', reasoning_effort: routeReason.effort, reasoning_profile: routeReason.profile, reasoning_temporary: true, team_agent_reasoning_policy: teamReasoning, goal_continuation: pipelinePlan.goal_continuation, agent_sessions: agentSessions, role_counts: roleCounts, team_roster_confirmed: true, team_graph_ready: runtime.ok, team_live_ready: true, from_chat_img_required: fromChatImgRequired, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT, prompt });
  const result = {
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
    role_counts: roleCounts,
    questions: path.join(dir, 'questions.md'),
    codex_agents: ['analysis_scout', 'team_consensus', 'implementation_worker', 'db_safety_reviewer', 'qa_reviewer']
  };
  if (mock) {
    const cleanup = { schema_version: 1, mission_id: id, status: 'clean', outstanding_sessions: 0, mock: true, generated_at: nowIso() };
    await writeJsonAtomic(path.join(dir, TEAM_SESSION_CLEANUP_ARTIFACT), cleanup);
    const gate = { passed: true, team_roster_confirmed: true, analysis_artifact: true, triwiki_refreshed: true, triwiki_validated: true, consensus_artifact: true, ...runtime.gate_fields, implementation_team_fresh: true, review_artifact: true, review_lanes: MIN_TEAM_REVIEWER_LANES, integration_evidence: true, session_cleanup: true, context7_evidence: true, mock: true };
    await writeJsonAtomic(path.join(dir, 'team-gate.json'), gate);
    const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$Team', gateFile: 'team-gate.json', gate, mock: true, artifacts: ['team-gate.json', TEAM_SESSION_CLEANUP_ARTIFACT, 'team-plan.json', 'team-runtime-tasks.json', 'completion-proof.json'], claims: [{ id: 'team-fixture-complete', status: 'verified_partial' }], command: { cmd: `sks team "${prompt}" --mock`, status: 0 } });
    result.mock = true;
    result.proof = proof.validation;
  } else {
    result.tmux = await launchTmuxTeamView({ root, missionId: id, plan, promptFile: result.workflow, json: jsonOutput || !openTmux, attach: openTmux, args });
  }
  if (jsonOutput) return console.log(JSON.stringify(result, null, 2));
  console.log(`Team mission created: ${id}`);
  console.log(`Agent sessions: ${agentSessions}`);
  console.log(`Role counts: ${formatRoleCounts(roleCounts)}`);
  console.log(`Review policy: minimum ${MIN_TEAM_REVIEWER_LANES} reviewer/QA validation lanes`);
  if (result.tmux?.ready) console.log(`tmux: opened ${result.tmux.opened_lane_count || result.tmux.agents.length} agent lane(s) in ${result.tmux.session || result.tmux.workspace}`);
  else if (!mock) console.log(`tmux: blocked (${Array.from(new Set(result.tmux?.blockers || [])).join('; ')})`);
  console.log(`Watch: sks team watch ${id}`);
  console.log(`Artifacts: .sneakoscope/missions/${id}`);
}

export function parseTeamCreateArgs(args) {
  const spec = parseTeamSpecArgs(args);
  const prompt = spec.cleanArgs.join(' ').trim();
  const normalized = normalizeTeamSpec({ agentSessions: spec.agentSessions, roleCounts: spec.roleCounts, prompt });
  return { prompt, agentSessions: normalized.agentSessions, roleCounts: normalized.roleCounts, roster: normalized.roster };
}

export function buildTeamPlan(id, prompt, opts = {}) {
  const spec = normalizeTeamSpec({ ...opts, prompt });
  const { agentSessions, roleCounts, roster } = spec;
  const fromChatImgRequired = hasFromChatImgSignal(prompt);
  const requiredArtifacts = ['team-roster.json', 'work-order-ledger.json', 'effort-decision.json', 'team-dashboard-state.json', 'team-analysis.md', ...(fromChatImgRequired ? [FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT] : []), 'team-consensus.md', ...teamRuntimeRequiredArtifacts(), 'team-review.md', 'team-gate.json', TEAM_SESSION_CLEANUP_ARTIFACT, 'team-live.md', 'team-transcript.jsonl', 'team-dashboard.json', '.sneakoscope/wiki/context-pack.json', 'context7-evidence.jsonl'];
  return {
    schema_version: 1,
    mission_id: id,
    mode: 'team',
    prompt,
    agent_session_count: agentSessions,
    default_agent_session_count: MIN_TEAM_REVIEWER_LANES,
    role_counts: roleCounts,
    session_policy: `Use at most ${agentSessions} subagent sessions at a time; parent orchestrator is not counted.`,
    review_policy: teamReviewPolicy(),
    review_gate: evaluateTeamReviewPolicyGate({ roleCounts, agentSessions, roster }),
    bundle_size: roster.bundle_size,
    roster,
    goal_continuation: ambientGoalContinuation(),
    team_model: {
      phases: ['parallel_analysis_scouts', 'triwiki_stage_refresh', 'debate_team', 'triwiki_stage_refresh', 'runtime_task_graph', 'development_team', 'triwiki_stage_refresh', 'review', 'session_cleanup'],
      analysis_team: `Read-only parallel scouting with exactly ${roster.bundle_size} analysis_scout_N agents.`,
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
    context_tracking: triwikiContextTracking(),
    phases: [
      { id: 'team_roster_confirmation', goal: 'Materialize Team roster and write team-roster.json.', agents: ['parent_orchestrator'], output: 'team-roster.json' },
      { id: 'parallel_analysis_scouting', goal: fromChatImgRequired ? `Complete From-Chat-IMG source inventory and coverage artifacts. ${CODEX_COMPUTER_USE_ONLY_POLICY}` : 'Read relevant TriWiki context and run read-only analysis scouts before debate.', agents: roster.analysis_team.map((agent) => agent.id), max_parallel_subagents: agentSessions, write_policy: 'read-only', output: 'team-analysis.md' },
      { id: 'triwiki_refresh', goal: 'Refresh and validate TriWiki from scout findings.', agents: ['parent_orchestrator'], commands: ['sks wiki refresh', 'sks wiki validate .sneakoscope/wiki/context-pack.json'], output: '.sneakoscope/wiki/context-pack.json' },
      { id: 'planning_debate', goal: 'Debate risks and viable approaches with refreshed context.', agents: roster.debate_team.map((agent) => agent.id), max_parallel_subagents: agentSessions, write_policy: 'read-only' },
      { id: 'runtime_task_graph_compile', goal: `Compile ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, and ${TEAM_DECOMPOSITION_ARTIFACT}.`, agents: ['parent_orchestrator'] },
      { id: 'parallel_implementation', goal: 'Fresh executor developers implement disjoint slices.', agents: roster.development_team.map((agent) => agent.id), max_parallel_subagents: agentSessions, write_policy: 'workspace-write with explicit ownership' },
      { id: 'review_and_integrate', goal: `Review with at least ${MIN_TEAM_REVIEWER_LANES} independent lanes.`, agents: roster.validation_team.map((agent) => agent.id).concat(['parent_orchestrator']), min_reviewer_lanes: MIN_TEAM_REVIEWER_LANES },
      { id: 'session_cleanup', goal: `Write ${TEAM_SESSION_CLEANUP_ARTIFACT}.`, agents: ['parent_orchestrator'], output: TEAM_SESSION_CLEANUP_ARTIFACT }
    ],
    invariants: ['The parent thread remains the orchestrator and owns final integration.', 'Analysis scouts are read-only.', 'Implementation workers receive disjoint ownership scopes.', MIN_TEAM_REVIEW_POLICY_TEXT],
    live_visibility: { markdown: 'team-live.md', transcript: 'team-transcript.jsonl', dashboard: 'team-dashboard.json' },
    required_artifacts: requiredArtifacts,
    prompt_command: fromChatImgRequired ? '$From-Chat-IMG' : '$Team'
  };
}

export function teamWorkflowMarkdown(plan) {
  const ctx = plan.context_tracking || triwikiContextTracking();
  return `# SKS Team Mission

Mission: ${plan.mission_id}

Prompt:
${plan.prompt}

## Codex App Prompt

\`\`\`text
${plan.prompt_command || '$Team'} ${plan.prompt}

Use at most ${plan.agent_session_count || MIN_TEAM_REVIEWER_LANES} subagent sessions at a time; the parent orchestrator is not counted. ${plan.review_policy?.text || MIN_TEAM_REVIEW_POLICY_TEXT}
\`\`\`

## Context Tracking

- SSOT: ${ctx.ssot}
- Pack: ${ctx.default_pack}
- Refresh: \`${ctx.pack_command}\`
- Validate: \`${ctx.validate_command}\`

## Analysis Scouts

${plan.roster.analysis_team.map((agent) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Debate Team

${plan.roster.debate_team.map((agent) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Development Team

${plan.roster.development_team.map((agent) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Validation Team

${plan.roster.validation_team.map((agent) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Phases

${plan.phases.map((phase, idx) => `${idx + 1}. ${phase.id}: ${phase.goal}`).join('\n')}

## Invariants

${plan.invariants.map((x) => `- ${x}`).join('\n')}
`;
}

async function teamCommand(sub, args) {
  const root = await sksRoot();
  const missionArg = args[0] && !String(args[0]).startsWith('--') ? args[0] : 'latest';
  const { resolveMissionId } = await import('./command-utils.mjs');
  const id = await resolveMissionId(root, missionArg);
  if (!id) {
    console.error(`Usage: sks team ${sub} [mission-id|latest]`);
    process.exitCode = 1;
    return;
  }
  const { dir } = await loadMission(root, id);
  if (sub === 'open-tmux' || sub === 'attach-tmux') {
    const plan = await readJson(path.join(dir, 'team-plan.json'), null);
    if (!plan) {
      console.error(`Team plan missing for ${id}; cannot open tmux Team view.`);
      process.exitCode = 2;
      return;
    }
    const tmux = await launchTmuxTeamView({ root, missionId: id, plan, promptFile: path.join(dir, 'team-workflow.md'), json: flag(args, '--json'), attach: sub === 'attach-tmux' || !flag(args, '--no-attach'), args });
    if (flag(args, '--json')) return console.log(JSON.stringify(tmux, null, 2));
    if (!tmux.ready) {
      console.error(`tmux Team view blocked for ${id}: ${(tmux.blockers || []).join('; ') || 'tmux creation failed'}`);
      process.exitCode = 2;
      return;
    }
    console.log(`tmux: opened ${tmux.opened_lane_count || tmux.lanes?.length || 0} Team lane(s) in ${tmux.session}`);
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
    if (plan) await reconcileTmuxTeamCockpit({ root, missionId: id, plan, promptFile: path.join(dir, 'team-workflow.md'), close: /^session_cleanup$|^team_cleanup$|^cleanup$/i.test(String(phase || '')), plannedFallback: false }).catch(() => null);
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
  if (sub === 'cleanup-tmux') {
    const control = await requestTeamSessionCleanup(dir, { missionId: id, agent: readFlagValue(args, '--agent', 'parent_orchestrator'), reason: readFlagValue(args, '--reason', 'Team session ended; clean up live follow panes.'), finalMessage: 'Team session ended.' });
    await appendTeamEvent(dir, { agent: readFlagValue(args, '--agent', 'parent_orchestrator'), phase: 'session_cleanup', type: 'cleanup', message: control.cleanup_reason || 'Team session cleanup requested.' });
    const cleanup = await cleanupTmuxTeamView({ root, missionId: id, closeSession: flag(args, '--close-session') || flag(args, '--close') });
    cleanup.control = control;
    if (flag(args, '--json')) return console.log(JSON.stringify(cleanup, null, 2));
    console.log(cleanup.ok ? `tmux cleanup: marked complete (${cleanup.reason || 'record updated'})` : `tmux cleanup skipped: ${cleanup.reason || 'not available'}`);
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
      // Follow mode intentionally falls through only for interactive terminals in the full tmux lane.
    }
    return;
  }
  if (sub === 'tail' || sub === 'watch') {
    const lines = readFlagValue(args, '--lines', '20');
    if (sub === 'watch' && !flag(args, '--raw')) console.log(await renderTeamWatch(dir, { missionId: id, lines: Number(lines) }));
    else for (const line of await readTeamTranscriptTail(dir, Number(lines))) console.log(line);
  }
}

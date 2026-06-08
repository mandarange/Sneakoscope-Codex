import path from 'node:path';
import { appendJsonlBounded, exists, nowIso, readJson, sksRoot, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { initProject } from '../init.js';
import { createMission, findLatestMission, loadMission, setCurrent } from '../mission.js';
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
import { narutoCommand } from './naruto-command.js';

const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json';

export async function team(args: any = []) {
  const teamSubcommands = new Set(['log', 'tail', 'watch', 'lane', 'status', 'dashboard', 'event', 'message', 'open-zellij', 'attach-zellij', 'cleanup-zellij', 'open-tmux', 'attach-tmux', 'cleanup-tmux']);
  if (teamSubcommands.has(args[0])) return teamCommand(args[0], args.slice(1));
  return redirectTeamCreateToNaruto(args);
}
async function redirectTeamCreateToNaruto(args: any[] = []) {
  const root = await sksRoot();
  const list = (args || []).map((arg: any) => String(arg));
  const narutoArgs = list[0] === 'run' ? list : ['run', ...list];
  console.warn('SKS Team is deprecated for new execution missions; redirecting to $Naruto.');
  const result: any = await narutoCommand(narutoArgs);
  const missionId = result?.mission_id || await findLatestMission(root);
  if (missionId) {
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'missions', missionId, 'team-alias-to-naruto.json'), {
      schema: 'sks.team-alias-to-naruto.v1',
      ok: true,
      mission_id: missionId,
      source_command: 'sks team',
      redirected_to: 'sks naruto run',
      route_command: '$Naruto',
      deprecated_route: '$Team',
      created_at: nowIso(),
      args: list
    });
  }
  return result;
}

export function parseTeamCreateArgs(args: any) {
  const spec = parseTeamSpecArgs(args);
  const prompt = spec.cleanArgs.join(' ').trim();
  const normalized = normalizeTeamSpec({ agentSessions: spec.agentSessions, roleCounts: spec.roleCounts, prompt });
  return { prompt, agentSessions: normalized.agentSessions, roleCounts: normalized.roleCounts, roster: normalized.roster };
}

function stripTeamCreateControlArgs(args: any[] = []) {
  const booleanFlags = new Set([
    '--open-zellij', '--zellij-open', '--no-open-zellij', '--no-zellij', '--no-attach',
    '--mock', '--ollama', '--local-model', '--no-ollama', '--no-local-model'
  ]);
  const valueFlags = new Set(['--ollama-model', '--local-model-model', '--ollama-base-url', '--local-model-base-url']);
  const out: any[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    if (booleanFlags.has(arg)) continue;
    if (valueFlags.has(arg)) {
      i += 1;
      continue;
    }
    if ([...valueFlags].some((flagName) => arg.startsWith(flagName + '='))) continue;
    out.push(args[i]);
  }
  return out;
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

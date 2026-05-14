import path from 'node:path';
import { appendJsonlBounded, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';
import { reasoningProfileName, triwikiContextTracking, triwikiContextTrackingText } from './routes.mjs';
import { MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_STAGE_AGENT_SESSIONS } from './team-review-policy.mjs';
export { MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_POLICY_TEXT, MIN_TEAM_REVIEW_STAGE_AGENT_SESSIONS, evaluateTeamReviewPolicyGate, teamReviewPolicy } from './team-review-policy.mjs';

const MAX_LIVE_BYTES = 192 * 1024;
const TEAM_RUNTIME_TASKS_ARTIFACT = 'team-runtime-tasks.json';
const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json';
const DEFAULT_AGENTS = ['parent_orchestrator', 'analysis_scout', 'team_consensus', 'implementation_worker', 'db_safety_reviewer', 'qa_reviewer'];
const TERMINAL_TEAM_AGENT_STATUSES = new Set([
  'agent_closed',
  'agent_done',
  'cancelled',
  'canceled',
  'cleanup',
  'cleanup_requested',
  'closed',
  'complete',
  'completed',
  'done',
  'ended',
  'failed',
  'stopped',
  'terminal',
  'tmux_lane_closed'
]);
const CHAT_COLOR_CODES = {
  blue: '34',
  cyan: '36',
  yellow: '33',
  magenta: '35',
  red: '31',
  green: '32',
  gray: '90'
};
export const DEFAULT_TEAM_ROLE_COUNTS = { user: 1, planner: 1, reviewer: MIN_TEAM_REVIEWER_LANES, executor: 3 };
export const DEFAULT_MAX_TEAM_AGENT_SESSIONS = 6;
const ROLE_ALIASES = {
  user: 'user',
  users: 'user',
  customer: 'user',
  customers: 'user',
  client: 'user',
  enduser: 'user',
  stakeholder: 'user',
  planner: 'planner',
  planners: 'planner',
  architect: 'planner',
  architects: 'planner',
  lead: 'planner',
  executor: 'executor',
  executors: 'executor',
  implementer: 'executor',
  implementers: 'executor',
  developer: 'executor',
  developers: 'executor',
  dev: 'executor',
  devs: 'executor',
  reviewer: 'reviewer',
  reviewers: 'reviewer',
  critic: 'reviewer',
  critics: 'reviewer',
  qa: 'reviewer',
  verifier: 'reviewer',
  verifiers: 'reviewer'
};

const TEAM_REASONING_POLICY_VERSION = 1;
const XHIGH_SIGNAL_RE = /(frontier|autoresearch|novelty|hypothesis|falsify|forensic|from-chat-img|image\s*work\s*order|새로운\s*연구|가설|포렌식)/i;
const HIGH_SIGNAL_RE = /(research|current docs?|library|framework|sdk|api|database|supabase|sql|migration|security|permission|mad|release|publish|deploy|commit|push|architecture|algorithm|policy|위험|보안|배포|커밋|푸쉬|마이그레이션|데이터베이스|권한|리서치|문서)/i;
const MEDIUM_SIGNAL_RE = /(tmux|terminal|cli|cmd|warp|tool(?:\s|-)?call|hook|router|routing|orchestrat|pipeline|multi[-\s]?pane|pane|process|config|many files?|여러\s*파일|터미널|라우팅|파이프라인|훅|도구|툴)/i;
const SIMPLE_SIGNAL_RE = /(tiny|simple|small|one[-\s]?line|typo|copy|label|spacing|rename|text|readme|docs?|config wording|간단|단순|오타|문구|라벨|간격|색상)/i;

export function teamAgentReasoning(input = {}) {
  const prompt = String(input.prompt || '');
  const role = String(input.role || '').toLowerCase();
  const id = String(input.id || input.agentId || '').toLowerCase();
  const base = teamPromptReasoning(prompt);
  let effort = base.effort;
  let reason = base.reason;

  if (/db|safety/.test(id) || role === 'safety') {
    effort = base.effort === 'xhigh' ? 'xhigh' : 'high';
    reason = 'db_or_safety_reviewer';
  } else if (/review|qa/.test(id) || role === 'reviewer') {
    effort = base.effort === 'low' ? 'medium' : base.effort;
    reason = base.effort === 'low' ? 'review_requires_more_than_low' : base.reason;
  } else if (/planner|consensus|debate/.test(id) || role === 'planner') {
    effort = base.effort === 'low' ? 'medium' : base.effort;
    reason = base.effort === 'low' ? 'planning_uses_medium_minimum' : base.reason;
  } else if (/user/.test(id) || role === 'user') {
    effort = 'low';
    reason = 'user_persona_lane';
  } else if (/executor|implementation/.test(id) || role === 'executor') {
    effort = base.effort === 'xhigh' ? 'high' : base.effort;
    reason = base.effort === 'xhigh' ? 'implementation_capped_at_high' : base.reason;
  }

  const profile = reasoningProfileName(effort);
  return {
    policy_version: TEAM_REASONING_POLICY_VERSION,
    reasoning_effort: effort,
    model_reasoning_effort: effort,
    reasoning_profile: profile,
    service_tier: 'fast',
    fast_mode: true,
    reasoning_reason: reason,
    routing: 'dynamic_team_agent_reasoning'
  };
}

export function teamPromptReasoning(prompt = '') {
  const text = String(prompt || '');
  if (XHIGH_SIGNAL_RE.test(text)) return { effort: 'xhigh', reason: 'research_forensic_or_frontier_signal' };
  if (HIGH_SIGNAL_RE.test(text)) return { effort: 'high', reason: 'knowledge_safety_release_or_db_signal' };
  if (SIMPLE_SIGNAL_RE.test(text) && !MEDIUM_SIGNAL_RE.test(text)) return { effort: 'low', reason: 'simple_bounded_code_or_content_change' };
  if (MEDIUM_SIGNAL_RE.test(text)) return { effort: 'medium', reason: 'tooling_or_runtime_orchestration_signal' };
  return { effort: 'medium', reason: 'default_team_balanced_reasoning' };
}

export function formatAgentReasoning(agent = {}) {
  const effort = agent.reasoning_effort || agent.model_reasoning_effort || 'medium';
  const profile = agent.reasoning_profile || reasoningProfileName(effort);
  const reason = agent.reasoning_reason || 'default_team_balanced_reasoning';
  return `${effort}/${profile}, fast, ${reason}`;
}

export function teamReasoningPolicy(prompt = '', roster = {}) {
  const agents = Array.isArray(roster.all_agents) ? roster.all_agents : [];
  const counts = {};
  for (const agent of agents) counts[agent.reasoning_effort || 'medium'] = (counts[agent.reasoning_effort || 'medium'] || 0) + 1;
  return {
    schema_version: TEAM_REASONING_POLICY_VERSION,
    dynamic: true,
    service_tier: 'fast',
    prompt_policy: teamPromptReasoning(prompt),
    allowed_efforts: ['low', 'medium', 'high', 'xhigh'],
    profile_map: {
      low: reasoningProfileName('low'),
      medium: reasoningProfileName('medium'),
      high: reasoningProfileName('high'),
      xhigh: reasoningProfileName('xhigh')
    },
    counts,
    rule: 'Assign per-agent reasoning from prompt risk and role; simple bounded work can use low, tool-heavy runtime work medium, knowledge/research/safety/release work high or xhigh.'
  };
}

export function teamLogPaths(dir) {
  return {
    live: path.join(dir, 'team-live.md'),
    transcript: path.join(dir, 'team-transcript.jsonl'),
    dashboard: path.join(dir, 'team-dashboard.json'),
    control: path.join(dir, 'team-control.json')
  };
}

export function defaultTeamDashboard(id, prompt, opts = {}) {
  const spec = normalizeTeamSpec({ ...opts, prompt });
  return {
    schema_version: 1,
    mission_id: id,
    prompt,
    agent_session_count: spec.agentSessions,
    role_counts: spec.roleCounts,
    session_policy: `Use at most ${spec.agentSessions} subagent sessions at a time; parent orchestrator is not counted.`,
    bundle_size: spec.bundleSize,
    roster: spec.roster,
    context_tracking: triwikiContextTracking(),
    updated_at: nowIso(),
    live_files: {
      markdown: 'team-live.md',
      transcript: 'team-transcript.jsonl',
      dashboard: 'team-dashboard.json'
    },
    commands: {
      status: `sks team status ${id}`,
      log: `sks team log ${id}`,
      tail: `sks team tail ${id}`,
      open_tmux: `sks team open-tmux ${id}`,
      watch: `sks team watch ${id}`,
      lane: `sks team lane ${id} --agent <agent> --follow`,
      event: `sks team event ${id} --agent <agent> --phase <phase> --message "..."`,
      message: `sks team message ${id} --from <agent> --to <agent|all> --message "..."`,
      cleanup: `sks team cleanup-tmux ${id}`
    },
    agents: Object.fromEntries([...new Set([...DEFAULT_AGENTS, ...spec.roster.all_agents.map((agent) => agent.id)])].map((name) => [name, { status: 'pending', phase: null, last_seen: null }])),
    phases: ['parallel_analysis_scouting', 'triwiki_refresh', 'debate_team', 'triwiki_refresh_after_consensus', 'parallel_development_team', 'triwiki_refresh_after_implementation', 'strict_review_and_user_acceptance', 'session_cleanup'],
    latest_messages: []
  };
}

export function teamLiveMarkdown(id, prompt, opts = {}) {
  const spec = normalizeTeamSpec({ ...opts, prompt });
  const contextTracking = triwikiContextTrackingText();
  return `# SKS Team Live Transcript

Mission: ${id}

Agent session budget: ${spec.agentSessions}

Bundle size: ${spec.bundleSize}

Role counts: ${formatRoleCounts(spec.roleCounts)}

Task:
${prompt}

## How to Read

- This file is the Codex App-visible replacement for tmux-style team panes.
- Use at most ${spec.agentSessions} subagent sessions at a time unless the mission is recreated with a different budget.
- Team mode has three bundles: parallel analysis scouts first, debate team second, then fresh parallel development team.
- Use relevant TriWiki context before every stage, hydrate low-trust claims from source during the stage, refresh after findings/artifact changes, and validate before handoffs or final claims.
- Analysis scouts are read-only and split repo, docs, tests, risk, API, and user-flow investigation before the parent refreshes TriWiki for debate.
- executor:N means build N debate participants and then a separate N-person executor development team.
- Debate uses compact Hyperplan-derived adversarial lenses: challenge framing, subtract surface, demand evidence, test integration risk, and consider one simpler alternative.
- User personas are intentionally impatient, self-interested, stubborn, low-context, and dislike inconvenience.
- Executors are capable developers with disjoint ownership.
- Team reviewer lane policy enforces at least ${MIN_TEAM_REVIEWER_LANES} strict reviewers and enough review-stage parallel capacity.
- Reviewers are strict and adversarial about correctness, safety, tests, and evidence.
- Every useful subagent status, debate result, handoff, review finding, and integration decision must be appended here.
- Before reflection/final, close or account for all Team subagent sessions and write team-session-cleanup.json.
- Machine-readable events are mirrored to team-transcript.jsonl.
- Dashboard state is mirrored to team-dashboard.json.
- ${contextTracking}

## Commands

\`\`\`bash
sks team status ${id}
sks team log ${id}
sks team tail ${id}
sks team open-tmux ${id}
sks team watch ${id}
sks team lane ${id} --agent analysis_scout_1 --follow
sks team event ${id} --agent analysis_scout_1 --phase parallel_analysis_scouting --message "mapped repo slice"
sks team message ${id} --from analysis_scout_1 --to executor_1 --message "handoff note"
sks team cleanup-tmux ${id}
\`\`\`

## Roster

Analysis scouts (${spec.roster.analysis_team.length} scouts):
${spec.roster.analysis_team.map(formatRosterLine).join('\n')}

Debate team (${spec.roster.debate_team.length} participants):
${spec.roster.debate_team.map(formatRosterLine).join('\n')}

Development team (${spec.roster.development_team.length} executors):
${spec.roster.development_team.map(formatRosterLine).join('\n')}

Validation team:
${spec.roster.validation_team.map(formatRosterLine).join('\n')}

## Live Events
`;
}

export async function initTeamLive(id, dir, prompt, opts = {}) {
  const files = teamLogPaths(dir);
  const spec = normalizeTeamSpec({ ...opts, prompt });
  await writeJsonAtomic(files.dashboard, defaultTeamDashboard(id, prompt, opts));
  await writeJsonAtomic(files.control, defaultTeamControl(id));
  await writeTextAtomic(files.live, teamLiveMarkdown(id, prompt, opts));
  await writeTextAtomic(files.transcript, '');
  await appendTeamEvent(dir, { agent: 'parent_orchestrator', phase: 'mission_created', type: 'status', message: 'Team mission created and live transcript initialized.' });
  for (const scout of spec.roster.analysis_team || []) {
    await appendTeamEvent(dir, {
      agent: scout.id,
      phase: 'parallel_analysis_scouting',
      type: 'assigned',
      message: `${scout.id} scout lane assigned; waiting for read-only repository/docs/tests/API/risk slice activity.`
    });
  }
  return files;
}

export function defaultTeamControl(id) {
  return {
    schema_version: 1,
    mission_id: id,
    status: 'running',
    cleanup_requested: false,
    cleanup_requested_at: null,
    cleanup_requested_by: null,
    cleanup_reason: null,
    final_message: null
  };
}

export function normalizeTeamAgentSessions(value, fallback = 3) {
  const n = Number(value ?? fallback);
  return Math.min(12, Math.max(1, Number.isFinite(n) ? Math.floor(n) : fallback));
}

export function parseTeamSpecArgs(args = []) {
  const cleanArgs = [];
  let roleCounts = { ...DEFAULT_TEAM_ROLE_COUNTS };
  let explicitSession = null;
  let explicitExecutor = false;
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    const rolePair = parseRolePair(arg);
    if (rolePair) {
      roleCounts[rolePair.role] = rolePair.count;
      if (rolePair.role === 'executor') explicitExecutor = true;
      continue;
    }
    const flagPair = arg.match(/^--([A-Za-z_-]+)=(\d+)$/);
    if (flagPair) {
      const role = normalizeTeamRole(flagPair[1]);
      if (role) {
        roleCounts[role] = normalizeTeamAgentSessions(flagPair[2], roleCounts[role] || 1);
        if (role === 'executor') explicitExecutor = true;
        continue;
      }
    }
    if (/^--(?:max-agents|max-sessions|max-team)$/.test(arg)) {
      explicitSession = DEFAULT_MAX_TEAM_AGENT_SESSIONS;
      if (!explicitExecutor) roleCounts.executor = DEFAULT_MAX_TEAM_AGENT_SESSIONS;
      continue;
    }
    if (/^--(?:agents|sessions|team-size)$/.test(arg)) {
      explicitSession = normalizeTeamAgentSessions(args[i + 1]);
      if (!explicitExecutor) roleCounts.executor = explicitSession;
      i++;
      continue;
    }
    const sessionEq = arg.match(/^--(?:agents|sessions|team-size)=(\d+)$/);
    if (sessionEq) {
      explicitSession = normalizeTeamAgentSessions(sessionEq[1]);
      if (!explicitExecutor) roleCounts.executor = explicitSession;
      continue;
    }
    const flagRole = arg.match(/^--([A-Za-z_-]+)$/);
    const role = flagRole ? normalizeTeamRole(flagRole[1]) : null;
    if (role && args[i + 1] && /^\d+$/.test(String(args[i + 1]))) {
      roleCounts[role] = normalizeTeamAgentSessions(args[i + 1], roleCounts[role] || 1);
      if (role === 'executor') explicitExecutor = true;
      i++;
      continue;
    }
    if (arg === '--json' || arg === '--open-tmux' || arg === '--tmux-open' || arg === '--no-open-tmux' || arg === '--no-tmux' || arg === '--no-attach' || arg === '--separate-session' || arg === '--new-session' || arg === '--legacy-team-session' || arg === '--no-dynamic-team-tmux') continue;
    cleanArgs.push(args[i]);
  }
  return { cleanArgs, ...normalizeTeamSpec({ roleCounts, agentSessions: explicitSession }) };
}

export function parseTeamSpecText(text = '') {
  let roleCounts = { ...DEFAULT_TEAM_ROLE_COUNTS };
  let explicitExecutor = false;
  const wantsMaxAgents = /\b(max|maximum|maximal|available agents?)\b|최대|가용가능/i.test(String(text || ''));
  const prompt = String(text || '').replace(/\b([A-Za-z][A-Za-z_-]*):(\d+)\b/g, (token) => {
    const parsed = parseRolePair(token);
    if (!parsed) return token;
    roleCounts[parsed.role] = parsed.count;
    if (parsed.role === 'executor') explicitExecutor = true;
    return '';
  }).replace(/\s+/g, ' ').trim();
  if (wantsMaxAgents && !explicitExecutor) roleCounts.executor = DEFAULT_MAX_TEAM_AGENT_SESSIONS;
  return { prompt, ...normalizeTeamSpec({ roleCounts, agentSessions: wantsMaxAgents ? roleCounts.executor : undefined, prompt }) };
}

export function normalizeTeamSpec(opts = {}) {
  const roleCounts = normalizeTeamRoleCounts(opts.roleCounts);
  if (opts.agentSessions !== undefined && (!opts.roleCounts || opts.roleCounts.executor === undefined)) {
    roleCounts.executor = normalizeTeamAgentSessions(opts.agentSessions, roleCounts.executor);
  }
  const bundleSize = normalizeTeamAgentSessions(roleCounts.executor, DEFAULT_TEAM_ROLE_COUNTS.executor);
  const reviewStageSessions = normalizeTeamAgentSessions(roleCounts.reviewer, MIN_TEAM_REVIEW_STAGE_AGENT_SESSIONS);
  const agentSessions = Math.max(normalizeTeamAgentSessions(opts.agentSessions ?? bundleSize), reviewStageSessions);
  return { agentSessions, bundleSize, roleCounts, roster: buildTeamRoster(roleCounts, { prompt: opts.prompt || opts.task || '' }) };
}

export function normalizeTeamRoleCounts(input = {}) {
  const counts = { ...DEFAULT_TEAM_ROLE_COUNTS };
  for (const [key, value] of Object.entries(input || {})) {
    const role = normalizeTeamRole(key);
    if (role) counts[role] = normalizeTeamAgentSessions(value, counts[role] || 1);
  }
  counts.reviewer = Math.max(MIN_TEAM_REVIEWER_LANES, counts.reviewer);
  return counts;
}

export function buildTeamRoster(roleCounts = DEFAULT_TEAM_ROLE_COUNTS, opts = {}) {
  const counts = normalizeTeamRoleCounts(roleCounts);
  const prompt = String(opts.prompt || opts.task || '');
  const bundleSize = normalizeTeamAgentSessions(counts.executor);
  const debateUsers = numberedAgents('debate_user', counts.user, 'Impatient final user voice: low-context, self-interested, stubborn, dislikes inconvenience, rejects clever work that feels annoying.', 'user', { prompt });
  const debatePlanners = numberedAgents('debate_planner', counts.planner, 'Pragmatic planner: distills only defensible findings into one objective, required clarification questions, constraints, acceptance criteria, and disjoint work slices.', 'planner', { prompt });
  const debateReviewers = numberedAgents('debate_reviewer', counts.reviewer, 'Strict debate reviewer: applies validator/researcher lenses to correctness, safety, DB risk, tests, regressions, and unsupported assumptions.', 'reviewer', { prompt });
  const debateExecutorPool = numberedAgents('debate_executor', bundleSize, 'Capable developer voice in debate: applies skeptic/architect lenses to implementation shape, ownership boundaries, dependencies, coupling, and risks before coding starts.', 'executor', { prompt });
  const debateTeam = composeDebateTeam({ users: debateUsers, planners: debatePlanners, reviewers: debateReviewers, executors: debateExecutorPool, bundleSize });
  const analysisScouts = numberedAgents('analysis_scout', bundleSize, 'Read-only analysis scout: quickly maps one independent slice of repo/docs/tests/API risk, records source paths and evidence, and returns TriWiki-ready findings.', 'scout', { prompt });
  const developmentExecutors = numberedAgents('executor', bundleSize, 'Capable developer executor: owns one disjoint implementation slice and coordinates without reverting others.', 'executor', { prompt });
  const validationReviewers = numberedAgents('reviewer', counts.reviewer, 'Strict reviewer: adversarial about correctness, safety, DB risk, tests, regressions, and unsupported claims.', 'reviewer', { prompt });
  const validationUsers = numberedAgents('user', counts.user, 'Impatient final user acceptance persona: low-context, self-interested, stubborn, dislikes inconvenience, rejects clever work that feels annoying.', 'user', { prompt });
  return {
    role_counts: counts,
    bundle_size: bundleSize,
    analysis_team: analysisScouts.map((agent) => ({ ...agent, write_policy: 'read-only scouting', output: 'team-analysis.md' })),
    debate_team: debateTeam,
    development_team: developmentExecutors.map((agent) => ({ ...agent, write_policy: 'workspace-write with explicit ownership' })),
    validation_team: [
      ...validationReviewers.map((agent) => ({ ...agent, write_policy: 'read-only strict review' })),
      ...validationUsers.map((agent) => ({ ...agent, phase_role: 'acceptance_persona' }))
    ],
    all_agents: [...analysisScouts, ...debateTeam, ...developmentExecutors, ...validationReviewers, ...validationUsers]
  };
}

export function formatRoleCounts(roleCounts = DEFAULT_TEAM_ROLE_COUNTS) {
  const counts = normalizeTeamRoleCounts(roleCounts);
  return Object.entries(counts).map(([role, count]) => `${role}:${count}`).join(' ');
}

function numberedAgents(prefix, count, persona, role = prefix, opts = {}) {
  return Array.from({ length: normalizeTeamAgentSessions(count, 1) }, (_, i) => {
    const id = `${prefix}_${i + 1}`;
    return { id, role, index: i + 1, persona, ...teamAgentReasoning({ prompt: opts.prompt || '', role, id }) };
  });
}

function formatRosterLine(agent = {}) {
  return `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`;
}

function composeDebateTeam({ users, planners, reviewers, executors, bundleSize }) {
  const selected = [];
  const used = new Set();
  const add = (agent) => {
    if (!agent || selected.length >= bundleSize || used.has(agent.id)) return;
    selected.push(agent);
    used.add(agent.id);
  };
  add(users[0]);
  add(planners[0]);
  add(executors[0]);
  for (const agent of reviewers) add(agent);
  for (const agent of users.slice(1)) add(agent);
  for (const agent of planners.slice(1)) add(agent);
  for (const agent of executors.slice(1)) add(agent);
  return selected.slice(0, bundleSize);
}

function parseRolePair(token) {
  const match = String(token || '').match(/^([A-Za-z][A-Za-z_-]*):(\d+)$/);
  if (!match) return null;
  const role = normalizeTeamRole(match[1]);
  if (!role) return null;
  return { role, count: normalizeTeamAgentSessions(match[2], DEFAULT_TEAM_ROLE_COUNTS[role] || 1) };
}

function normalizeTeamRole(role) {
  return ROLE_ALIASES[String(role || '').trim().toLowerCase().replace(/[^a-z_-]/g, '')] || null;
}

export async function appendTeamEvent(dir, event) {
  const files = teamLogPaths(dir);
  const record = normalizeEvent(event);
  await appendJsonlBounded(files.transcript, record, 1024 * 1024);
  const dashboard = await readJson(files.dashboard, null);
  if (dashboard) {
    dashboard.updated_at = record.ts;
    dashboard.latest_messages = [...(dashboard.latest_messages || []), record].slice(-20);
    const agent = record.agent || 'unknown';
    const terminalStatus = terminalTeamAgentStatusFromEvent(record);
    dashboard.agents ||= {};
    dashboard.agents[agent] ||= {};
    dashboard.agents[agent].status = terminalStatus || record.type || 'active';
    dashboard.agents[agent].phase = record.phase || null;
    dashboard.agents[agent].last_seen = record.ts;
    if (terminalStatus) dashboard.agents[agent].closed_at = record.ts;
    await writeJsonAtomic(files.dashboard, dashboard);
  }
  await reconcileTeamTmuxFromEvent(dir, record).catch(() => null);
  const current = await readText(files.live, teamLiveMarkdown('unknown', 'unknown'));
  const target = record.to ? ` -> ${record.to}` : '';
  const line = `\n- ${record.ts} [${record.phase || 'general'}] ${record.agent || 'unknown'}${target}: ${record.message || ''}${record.artifact ? ` (${record.artifact})` : ''}\n`;
  await writeTextAtomic(files.live, trimLiveMarkdown(`${current.trimEnd()}${line}`));
  return record;
}

async function reconcileTeamTmuxFromEvent(dir, record = {}) {
  if (!process.env.TMUX || String(process.env.SKS_TMUX_EVENT_RECONCILE || '1') === '0') return null;
  if (record.type === 'tmux_lane_opened') return null;
  const missionId = path.basename(dir);
  const root = path.resolve(dir, '..', '..', '..');
  const cockpitState = await readJson(path.join(root, '.sneakoscope', 'state', 'tmux-cockpit.json'), {}).catch(() => ({}));
  if (!cockpitState?.missions?.[missionId]) return null;
  const plan = await readJson(path.join(dir, 'team-plan.json'), null).catch(() => null);
  if (!plan) return null;
  const { reconcileTmuxTeamCockpit } = await import('./tmux-ui.mjs');
  const phase = String(record.phase || '');
  const type = String(record.type || '');
  const close = /^session_cleanup$|^team_cleanup$|^cleanup$/i.test(phase) || /^cleanup$/i.test(type);
  return reconcileTmuxTeamCockpit({ root, missionId, plan, close, plannedFallback: false });
}

export async function readTeamControl(dir) {
  const control = await readJson(teamLogPaths(dir).control, defaultTeamControl(path.basename(dir)));
  const cleanup = await readJson(path.join(dir, TEAM_SESSION_CLEANUP_ARTIFACT), null).catch(() => null);
  if (!cleanup || (cleanup.passed !== true && cleanup.live_transcript_finalized !== true && cleanup.all_sessions_closed !== true)) return control;
  return {
    ...defaultTeamControl(path.basename(dir)),
    ...control,
    status: 'ended',
    cleanup_requested: true,
    cleanup_requested_at: cleanup.updated_at || cleanup.completed_at || cleanup.closed_at || control.cleanup_requested_at || 'artifact',
    cleanup_requested_by: cleanup.agent || control.cleanup_requested_by || 'parent_orchestrator',
    cleanup_reason: cleanup.reason || control.cleanup_reason || `${TEAM_SESSION_CLEANUP_ARTIFACT} passed.`,
    final_message: cleanup.final_message || control.final_message || 'Team session ended. Lane follow loops stop and managed tmux Team panes should close.'
  };
}

export async function requestTeamSessionCleanup(dir, opts = {}) {
  const files = teamLogPaths(dir);
  const current = await readTeamControl(dir);
  const next = {
    ...defaultTeamControl(current?.mission_id || opts.missionId || path.basename(dir)),
    ...current,
    status: 'cleanup_requested',
    cleanup_requested: true,
    cleanup_requested_at: opts.ts || nowIso(),
    cleanup_requested_by: opts.agent || 'parent_orchestrator',
    cleanup_reason: opts.reason || 'Team session cleanup requested.',
    final_message: opts.finalMessage || 'Team session ended. Lane/watch follow loops stop after this summary; managed tmux Team panes are closed when reachable.'
  };
  await writeJsonAtomic(files.control, next);
  return next;
}

export function teamCleanupRequested(control = {}) {
  return Boolean(control?.cleanup_requested || control?.status === 'cleanup_requested' || control?.status === 'ended');
}

export function isTerminalTeamAgentStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  return TERMINAL_TEAM_AGENT_STATUSES.has(normalized) || /(?:^|_)(?:done|complete|completed|closed|cleanup|cancelled|canceled|failed|ended|stopped)(?:_|$)/.test(normalized);
}

export function terminalTeamAgentStatusFromEvent(event = {}) {
  const type = String(event.type || '').trim().toLowerCase();
  if (isTerminalTeamAgentStatus(type)) return type;
  const phase = String(event.phase || '').trim().toLowerCase();
  if (isTerminalTeamAgentStatus(phase)) return phase;
  const message = String(event.message || '').trim();
  if (/^(?:done|complete|completed|finished|final|closed|agent_done|agent_closed)\b/i.test(message)) return 'completed';
  if (/(?:작업|분석|구현|검토|리뷰|qa|lane|agent|에이전트).{0,40}(?:완료|종료|끝)/i.test(message)) return 'completed';
  return '';
}

export function renderTeamCleanupSummary(control = {}) {
  if (!teamCleanupRequested(control)) return '';
  return [
    '# SKS Team Session Cleanup',
    '',
    `Status: ${control.status || 'cleanup_requested'}`,
    `Requested at: ${control.cleanup_requested_at || 'unknown'}`,
    `Requested by: ${control.cleanup_requested_by || 'unknown'}`,
    `Reason: ${control.cleanup_reason || 'Team session cleanup requested.'}`,
    '',
    control.final_message || 'Team session ended. managed tmux Team panes are closed when reachable.'
  ].join('\n');
}

export async function readTeamDashboard(dir) {
  return readJson(teamLogPaths(dir).dashboard, null);
}

export async function readTeamLive(dir) {
  return readText(teamLogPaths(dir).live, '');
}

export async function readTeamTranscriptTail(dir, count = 20) {
  const text = await readText(teamLogPaths(dir).transcript, '');
  return text.split(/\n/).filter(Boolean).slice(-Math.max(1, Number(count) || 20));
}

export async function renderTeamAgentLane(dir, opts = {}) {
  const agent = String(opts.agent || opts.agentId || 'parent_orchestrator');
  const phase = opts.phase ? String(opts.phase) : null;
  const lines = Math.max(1, Number(opts.lines) || 12);
  const dashboard = await readTeamDashboard(dir);
  const control = await readTeamControl(dir);
  const runtime = await readJson(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), null);
  const missionId = opts.missionId || dashboard?.mission_id || runtime?.mission_id || path.basename(dir);
  const status = dashboard?.agents?.[agent] || {};
  const runtimeTasks = Array.isArray(runtime?.tasks) ? runtime.tasks : Array.isArray(runtime) ? runtime : [];
  const eventWindow = await readTeamTranscriptTail(dir, Math.max(lines * 8, 80));
  const parsedWindow = eventWindow.map(parseTranscriptLine).filter(Boolean);
  const aliases = teamLaneAliases(agent, parsedWindow, dashboard, runtimeTasks);
  const aliasSet = new Set(aliases);
  const statusAliases = aliases.length > 1 ? [...aliases.slice(1), aliases[0]] : aliases;
  const laneStatus = statusAliases.map((id) => dashboard?.agents?.[id]).find((entry) => entry && entry.status && entry.status !== 'pending') || status;
  const assignedTasks = runtimeTasks.filter((task) => aliasSet.has(task?.worker) || aliasSet.has(task?.agent_hint));
  const agentEvents = parsedWindow.filter((event) => aliasSet.has(event?.agent) || aliases.some((id) => eventAddressedTo(event, id))).slice(-lines);
  const directMessages = parsedWindow.filter((event) => event?.type === 'message' && aliases.some((id) => eventAddressedTo(event, id))).slice(-lines);
  const chatEvents = uniqueTranscriptEvents([...agentEvents, ...directMessages])
    .sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')))
    .slice(-lines);
  const laneStyle = teamLaneTextStyle(agent);
  const colorChat = terminalChatColorEnabled(opts);
  return [
    `# SKS Team Agent Lane`,
    '',
    `Mission: ${missionId}`,
    `Agent: ${agent}`,
    aliases.length > 1 ? `Mirrored agents: ${aliases.slice(1).join(', ')}` : null,
    `Lane color: ${laneStyle.color_name}`,
    `Requested phase: ${phase || 'any'}`,
    teamCleanupRequested(control) ? `Cleanup: requested at ${control.cleanup_requested_at || 'unknown'}` : null,
    '',
    `## Agent Status`,
    `- status: ${laneStatus.status || 'pending'}`,
    `- phase: ${laneStatus.phase || 'unknown'}`,
    `- last_seen: ${laneStatus.last_seen || 'never'}`,
    '',
    `## Assigned Runtime Tasks`,
    ...(runtime ? formatRuntimeTasks(assignedTasks) : ['- team-runtime-tasks.json not available yet.']),
    '',
    `## Codex Chat`,
    ...(chatEvents.length ? chatEvents.map((event) => formatChatTranscriptEvent(event, aliases[0], { color: colorChat })) : ['- waiting for live agent messages...']),
    opts.includeGlobalTail ? '' : null,
    opts.includeGlobalTail ? `## Global Tail` : null,
    ...(opts.includeGlobalTail
      ? (await readTeamTranscriptTail(dir, lines)).map(parseTranscriptLine).filter(Boolean).map(formatTranscriptEvent)
      : []),
    teamCleanupRequested(control) ? ['', renderTeamCleanupSummary(control)].join('\n') : null
  ].filter((line) => line !== null).join('\n');
}

export async function renderTeamWatch(dir, opts = {}) {
  const lines = Math.max(1, Number(opts.lines) || 20);
  const dashboard = await readTeamDashboard(dir);
  const control = await readTeamControl(dir);
  const runtime = await readJson(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), null);
  const missionId = opts.missionId || dashboard?.mission_id || runtime?.mission_id || path.basename(dir);
  const visibleAgents = visibleDashboardAgentEntries(dashboard);
  const events = (await readTeamTranscriptTail(dir, lines)).map(parseTranscriptLine).filter(Boolean);
  const runtimeTasks = Array.isArray(runtime?.tasks) ? runtime.tasks : Array.isArray(runtime) ? runtime : [];
  return [
    '# SKS Team Live Orchestration',
    '',
    `Mission: ${missionId}`,
    `Updated: ${dashboard?.updated_at || 'unknown'}`,
    `Agent session budget: ${dashboard?.agent_session_count || 'unknown'}`,
    dashboard?.role_counts ? `Role counts: ${formatRoleCounts(dashboard.role_counts)}` : null,
    teamCleanupRequested(control) ? `Cleanup: requested at ${control.cleanup_requested_at || 'unknown'}` : null,
    '',
    '## Split-Screen Map',
    '- This overview pane follows the whole mission transcript.',
    '- Run `sks team open-tmux ...` to materialize or reopen the split-pane Team tmux view for an existing mission.',
    '- Inside an SKS-owned tmux session, Team panes are reconciled in the current window with the Codex pane on the left and Team lanes stacked on the right.',
    '- Neighbor tmux panes follow individual `sks team lane ... --agent <name>` chat-style views.',
    '- Use `sks team event ...` to mirror scout, debate, executor, review, and verification status into the live panes.',
    '- Use `sks team message ... --from <agent> --to <agent|all>` for bounded inter-agent communication in transcript/lane views.',
    '- Use `sks team cleanup-tmux ...` at session end; follow loops show cleanup and managed Team panes close when reachable.',
    '',
    '## Cockpit Views',
    '- Mission / Goal | Agents | MultiAgentV2 | Work Orders | Skills | Memory Health | Forget Queue',
    '- Mistake Immunity | Tool Reliability | Harness Experiments | Dogfood Evidence | Code Structure | Statusline/Title',
    '',
    '## Visible Agent Lanes',
    ...(visibleAgents.length
      ? visibleAgents.map(([name, status]) => `- ${name}: ${status.status || 'pending'} | ${status.phase || 'unknown'} | last_seen:${status.last_seen || 'never'}`)
      : ['- No agent lanes registered yet.']),
    '',
    '## Runtime Task Snapshot',
    ...(runtimeTasks.length ? formatRuntimeTasks(runtimeTasks.slice(0, 8)) : ['- team-runtime-tasks.json not available yet.']),
    '',
    '## Recent Mission Events',
    ...(events.length ? events.map(formatTranscriptEvent) : ['- No transcript events yet.']),
    teamCleanupRequested(control) ? ['', renderTeamCleanupSummary(control)].join('\n') : null
  ].filter((line) => line !== null).join('\n');
}

function visibleDashboardAgentEntries(dashboard = {}) {
  const agents = dashboard?.agents || {};
  const roster = dashboard?.roster || {};
  const analysis = uniqueAgentIds(roster.analysis_team || []);
  const debate = uniqueAgentIds(roster.debate_team || []);
  const development = uniqueAgentIds(roster.development_team || []);
  const validation = uniqueAgentIds(roster.validation_team || []);
  const reviewers = validation.filter((id) => /review|qa|validation/i.test(id));
  const reviewerTarget = Math.max(MIN_TEAM_REVIEWER_LANES, Number(dashboard?.role_counts?.reviewer) || 0);
  const reviewLanes = reviewers.slice(0, reviewerTarget);
  const phaseRepresentatives = [development[0], debate[0]].filter(Boolean);
  const requiredVisible = [...analysis, ...reviewLanes, ...phaseRepresentatives];
  const concreteAgentIds = Object.keys(agents).filter((name) => name !== 'parent_orchestrator' && !DEFAULT_AGENTS.includes(name));
  const fallbackAgentIds = Object.keys(agents).filter((name) => name !== 'parent_orchestrator');
  const limit = Math.max(3, Number(dashboard?.agent_session_count) || 3, requiredVisible.length);
  return uniqueAgentIds([...requiredVisible, ...concreteAgentIds, ...debate, ...development, ...validation, ...fallbackAgentIds])
    .slice(0, limit)
    .map((id) => [id, agents[id] || { status: 'pending', phase: null, last_seen: null }]);
}

function normalizeEvent(event = {}) {
  return {
    ts: event.ts || nowIso(),
    agent: String(event.agent || 'parent_orchestrator'),
    phase: String(event.phase || 'general'),
    type: String(event.type || 'status'),
    to: event.to ? String(event.to).slice(0, 200) : undefined,
    message: String(event.message || '').slice(0, 4000),
    artifact: event.artifact ? String(event.artifact) : undefined
  };
}

function uniqueAgentIds(agents = []) {
  const ids = [];
  const seen = new Set();
  for (const agent of agents) {
    const id = agent?.id || String(agent || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function parseTranscriptLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return { raw: String(line || '').slice(0, 1000) };
  }
}

function formatTranscriptEvent(event = {}) {
  if (event.raw) return `- ${event.raw}`;
  const parts = [
    event.ts || 'no-ts',
    `[${event.phase || 'general'}]`,
    event.agent || 'unknown',
    event.to ? `-> ${event.to}` : null,
    event.type ? `(${event.type})` : null
  ].filter(Boolean);
  const suffix = event.artifact ? ` (${event.artifact})` : '';
  return `- ${parts.join(' ')}: ${String(event.message || '').slice(0, 500)}${suffix}`;
}

function uniqueTranscriptEvents(events = []) {
  const seen = new Set();
  const out = [];
  for (const event of events) {
    const key = event?.raw || [event?.ts, event?.agent, event?.to, event?.type, event?.message].map((value) => String(value || '')).join('\t');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

function formatChatTranscriptEvent(event = {}, laneAgent = '', opts = {}) {
  if (event.raw) return codexChatBlock({ speaker: 'system', kind: 'raw', style: teamLaneTextStyle('overview'), color: opts.color, message: event.raw });
  const from = event.agent || 'unknown';
  const ts = event.ts ? `${event.ts} ` : '';
  const artifact = event.artifact ? ` (${event.artifact})` : '';
  const isLaneAgent = String(from) === String(laneAgent);
  return codexChatBlock({
    speaker: isLaneAgent ? `me (${from})` : from,
    to: event.to || '',
    kind: event.type || 'message',
    meta: ts.trim(),
    style: teamLaneTextStyle(from),
    color: opts.color,
    message: `${String(event.message || '').slice(0, 500)}${artifact}`
  });
}

function codexChatBlock({ speaker = 'agent', to = '', kind = '', meta = '', style = {}, color = false, message = '' } = {}) {
  const role = style?.role || 'agent';
  const roleKind = [kind, role].filter(Boolean).join('/');
  const target = to ? ` -> ${to}` : '';
  const header = [
    colorizeChatText(`${speaker}${target}`, style, color, { bold: true }),
    roleKind ? colorizeChatText(`[${roleKind}]`, style, color) : null,
    meta ? colorizeChatText(`| ${meta}`, { color_name: 'Gray' }, color) : null
  ].filter(Boolean).join(' ');
  const border = (text) => colorizeChatText(text, style, color);
  const body = String(message || '').split(/\r?\n/).map((line) => `${border('│')} ${colorizeChatText(line || ' ', style, color)}`).join('\n');
  return [`${border('╭─')} ${header}`, body || `${border('│')} `, border('╰─')].join('\n');
}

function terminalChatColorEnabled(opts = {}) {
  if (Object.prototype.hasOwnProperty.call(opts, 'color')) return Boolean(opts.color);
  if (process.env.NO_COLOR) return false;
  return Boolean(process.stdout?.isTTY);
}

function colorizeChatText(text, style = {}, enabled = false, opts = {}) {
  if (!enabled) return text;
  const colorName = String(style?.color_name || 'gray').toLowerCase();
  const colorCode = CHAT_COLOR_CODES[colorName] || CHAT_COLOR_CODES.gray;
  const code = opts.bold ? `1;${colorCode}` : colorCode;
  return `\x1b[${code}m${text}\x1b[0m`;
}

function eventAddressedTo(event = {}, agent = '') {
  if (!event?.to) return false;
  const target = String(event.to || '').trim().toLowerCase();
  const name = String(agent || '').trim().toLowerCase();
  return target === name || target === 'all' || target === '*' || target === 'broadcast';
}

function teamLaneAliases(agent = '', events = [], dashboard = null, runtimeTasks = []) {
  const primary = String(agent || '').trim();
  if (!primary) return [];
  const aliases = [primary];
  const ordinal = numberedLaneOrdinal(primary);
  if (!ordinal) return aliases;
  const role = teamLaneTextStyle(primary).role;
  const candidates = uniqueAgentIds([
    ...Object.keys(dashboard?.agents || {}),
    ...events.map((event) => event?.agent).filter(Boolean),
    ...runtimeTasks.flatMap((task) => [task?.worker, task?.agent_hint]).filter(Boolean)
  ])
    .filter((id) => id !== primary)
    .filter((id) => !DEFAULT_AGENTS.includes(id))
    .filter((id) => teamLaneTextStyle(id).role === role)
    .filter((id) => !numberedLaneOrdinal(id));
  const concrete = candidates[ordinal - 1];
  if (concrete) aliases.push(concrete);
  return aliases;
}

function numberedLaneOrdinal(agent = '') {
  const match = String(agent || '').match(/_(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function teamLaneTextStyle(agentId = '') {
  const id = String(agentId || '').toLowerCase();
  if (!id || id === 'mission_overview' || id === 'overview') return { role: 'overview', color_name: 'Blue' };
  if (/analysis|scout/.test(id)) return { role: 'scout', color_name: 'Cyan' };
  if (/debate|consensus|planner|user/.test(id)) return { role: 'planning', color_name: 'Yellow' };
  if (/db|safety/.test(id)) return { role: 'safety', color_name: 'Magenta' };
  if (/review|qa|validation/.test(id)) return { role: 'review', color_name: 'Red' };
  if (/executor|implementation|worker|developer/.test(id)) return { role: 'execution', color_name: 'Green' };
  return { role: 'planning', color_name: 'Yellow' };
}

function formatRuntimeTasks(tasks = []) {
  if (!tasks.length) return ['- No assigned runtime tasks found.'];
  return tasks.slice(0, 12).map((task) => {
    const details = [
      task.status || 'pending',
      task.phase || task.role || 'team',
      task.depends_on?.length ? `deps:${task.depends_on.join(',')}` : null,
      task.file_paths?.length ? `files:${task.file_paths.slice(0, 3).join(',')}` : null
    ].filter(Boolean).join(' | ');
    return `- ${task.task_id || 'task'} ${task.subject || task.symbolic_id || 'untitled'} (${details})`;
  });
}

function trimLiveMarkdown(text) {
  if (Buffer.byteLength(text) <= MAX_LIVE_BYTES) return text.endsWith('\n') ? text : `${text}\n`;
  const marker = '## Live Events\n';
  const i = text.indexOf(marker);
  const head = i >= 0 ? text.slice(0, i + marker.length) : '# SKS Team Live Transcript\n\n## Live Events\n';
  const tail = Buffer.from(text.slice(-MAX_LIVE_BYTES + Buffer.byteLength(head) - 80)).toString('utf8').replace(/^.*?\n/, '');
  return `${head}\n- Older events were compacted; read team-transcript.jsonl for the bounded machine log.\n${tail.endsWith('\n') ? tail : `${tail}\n`}`;
}

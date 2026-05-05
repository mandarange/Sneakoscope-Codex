import path from 'node:path';
import { appendJsonlBounded, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';
import { triwikiContextTracking, triwikiContextTrackingText } from './routes.mjs';

const MAX_LIVE_BYTES = 192 * 1024;
const TEAM_RUNTIME_TASKS_ARTIFACT = 'team-runtime-tasks.json';
const DEFAULT_AGENTS = ['parent_orchestrator', 'analysis_scout', 'team_consensus', 'implementation_worker', 'db_safety_reviewer', 'qa_reviewer'];
export const DEFAULT_TEAM_ROLE_COUNTS = { user: 1, planner: 1, reviewer: 1, executor: 3 };
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

export function teamLogPaths(dir) {
  return {
    live: path.join(dir, 'team-live.md'),
    transcript: path.join(dir, 'team-transcript.jsonl'),
    dashboard: path.join(dir, 'team-dashboard.json'),
    control: path.join(dir, 'team-control.json')
  };
}

export function defaultTeamDashboard(id, prompt, opts = {}) {
  const spec = normalizeTeamSpec(opts);
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
      watch: `sks team watch ${id}`,
      lane: `sks team lane ${id} --agent <agent> --follow`,
      event: `sks team event ${id} --agent <agent> --phase <phase> --message "..."`,
      message: `sks team message ${id} --from <agent> --to <agent|all> --message "..."`,
      cleanup: `sks team cleanup-warp ${id}`
    },
    agents: Object.fromEntries([...new Set([...DEFAULT_AGENTS, ...spec.roster.all_agents.map((agent) => agent.id)])].map((name) => [name, { status: 'pending', phase: null, last_seen: null }])),
    phases: ['parallel_analysis_scouting', 'triwiki_refresh', 'debate_team', 'triwiki_refresh_after_consensus', 'parallel_development_team', 'triwiki_refresh_after_implementation', 'strict_review_and_user_acceptance', 'session_cleanup'],
    latest_messages: []
  };
}

export function teamLiveMarkdown(id, prompt, opts = {}) {
  const spec = normalizeTeamSpec(opts);
  const contextTracking = triwikiContextTrackingText();
  return `# SKS Team Live Transcript

Mission: ${id}

Agent session budget: ${spec.agentSessions}

Bundle size: ${spec.bundleSize}

Role counts: ${formatRoleCounts(spec.roleCounts)}

Task:
${prompt}

## How to Read

- This file is the Codex App-visible replacement for warp-style team panes.
- Use at most ${spec.agentSessions} subagent sessions at a time unless the mission is recreated with a different budget.
- Team mode has three bundles: parallel analysis scouts first, debate team second, then fresh parallel development team.
- Use relevant TriWiki context before every stage, hydrate low-trust claims from source during the stage, refresh after findings/artifact changes, and validate before handoffs or final claims.
- Analysis scouts are read-only and split repo, docs, tests, risk, API, and user-flow investigation before the parent refreshes TriWiki for debate.
- executor:N means build N debate participants and then a separate N-person executor development team.
- User personas are intentionally impatient, self-interested, stubborn, low-context, and dislike inconvenience.
- Executors are capable developers with disjoint ownership.
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
sks team watch ${id}
sks team lane ${id} --agent analysis_scout_1 --follow
sks team event ${id} --agent analysis_scout_1 --phase parallel_analysis_scouting --message "mapped repo slice"
sks team message ${id} --from analysis_scout_1 --to executor_1 --message "handoff note"
sks team cleanup-warp ${id}
\`\`\`

## Roster

Analysis scouts (${spec.roster.analysis_team.length} scouts):
${spec.roster.analysis_team.map((agent) => `- ${agent.id}: ${agent.persona}`).join('\n')}

Debate team (${spec.roster.debate_team.length} participants):
${spec.roster.debate_team.map((agent) => `- ${agent.id}: ${agent.persona}`).join('\n')}

Development team (${spec.roster.development_team.length} executors):
${spec.roster.development_team.map((agent) => `- ${agent.id}: ${agent.persona}`).join('\n')}

Validation team:
${spec.roster.validation_team.map((agent) => `- ${agent.id}: ${agent.persona}`).join('\n')}

## Live Events
`;
}

export async function initTeamLive(id, dir, prompt, opts = {}) {
  const files = teamLogPaths(dir);
  await writeJsonAtomic(files.dashboard, defaultTeamDashboard(id, prompt, opts));
  await writeJsonAtomic(files.control, defaultTeamControl(id));
  await writeTextAtomic(files.live, teamLiveMarkdown(id, prompt, opts));
  await writeTextAtomic(files.transcript, '');
  await appendTeamEvent(dir, { agent: 'parent_orchestrator', phase: 'mission_created', type: 'status', message: 'Team mission created and live transcript initialized.' });
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
    if (arg === '--json' || arg === '--open-warp' || arg === '--warp-open') continue;
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
  return { prompt, ...normalizeTeamSpec({ roleCounts, agentSessions: wantsMaxAgents ? roleCounts.executor : undefined }) };
}

export function normalizeTeamSpec(opts = {}) {
  const roleCounts = normalizeTeamRoleCounts(opts.roleCounts);
  if (opts.agentSessions !== undefined && (!opts.roleCounts || opts.roleCounts.executor === undefined)) {
    roleCounts.executor = normalizeTeamAgentSessions(opts.agentSessions, roleCounts.executor);
  }
  const bundleSize = normalizeTeamAgentSessions(roleCounts.executor, DEFAULT_TEAM_ROLE_COUNTS.executor);
  const agentSessions = normalizeTeamAgentSessions(opts.agentSessions ?? bundleSize);
  return { agentSessions, bundleSize, roleCounts, roster: buildTeamRoster(roleCounts) };
}

export function normalizeTeamRoleCounts(input = {}) {
  const counts = { ...DEFAULT_TEAM_ROLE_COUNTS };
  for (const [key, value] of Object.entries(input || {})) {
    const role = normalizeTeamRole(key);
    if (role) counts[role] = normalizeTeamAgentSessions(value, counts[role] || 1);
  }
  return counts;
}

export function buildTeamRoster(roleCounts = DEFAULT_TEAM_ROLE_COUNTS) {
  const counts = normalizeTeamRoleCounts(roleCounts);
  const bundleSize = normalizeTeamAgentSessions(counts.executor);
  const debateUsers = numberedAgents('debate_user', counts.user, 'Impatient final user voice: low-context, self-interested, stubborn, dislikes inconvenience, rejects clever work that feels annoying.', 'user');
  const debatePlanners = numberedAgents('debate_planner', counts.planner, 'Pragmatic planner: turns vague intent into one objective, required clarification questions, constraints, acceptance criteria, and disjoint work slices.', 'planner');
  const debateReviewers = numberedAgents('debate_reviewer', counts.reviewer, 'Strict debate reviewer: adversarial about correctness, safety, DB risk, tests, regressions, and unsupported assumptions.', 'reviewer');
  const debateExecutorPool = numberedAgents('debate_executor', bundleSize, 'Capable developer voice in debate: estimates implementation shape, ownership boundaries, dependencies, and risks before coding starts.', 'executor');
  const debateTeam = composeDebateTeam({ users: debateUsers, planners: debatePlanners, reviewers: debateReviewers, executors: debateExecutorPool, bundleSize });
  const analysisScouts = numberedAgents('analysis_scout', bundleSize, 'Read-only analysis scout: quickly maps one independent slice of repo/docs/tests/API risk, records source paths and evidence, and returns TriWiki-ready findings.', 'scout');
  const developmentExecutors = numberedAgents('executor', bundleSize, 'Capable developer executor: owns one disjoint implementation slice and coordinates without reverting others.', 'executor');
  const validationReviewers = numberedAgents('reviewer', counts.reviewer, 'Strict reviewer: adversarial about correctness, safety, DB risk, tests, regressions, and unsupported claims.', 'reviewer');
  const validationUsers = numberedAgents('user', counts.user, 'Impatient final user acceptance persona: low-context, self-interested, stubborn, dislikes inconvenience, rejects clever work that feels annoying.', 'user');
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

function numberedAgents(prefix, count, persona, role = prefix) {
  return Array.from({ length: normalizeTeamAgentSessions(count, 1) }, (_, i) => ({ id: `${prefix}_${i + 1}`, role, index: i + 1, persona }));
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
    dashboard.agents ||= {};
    dashboard.agents[agent] ||= {};
    dashboard.agents[agent].status = record.type || 'active';
    dashboard.agents[agent].phase = record.phase || null;
    dashboard.agents[agent].last_seen = record.ts;
    await writeJsonAtomic(files.dashboard, dashboard);
  }
  const current = await readText(files.live, teamLiveMarkdown('unknown', 'unknown'));
  const target = record.to ? ` -> ${record.to}` : '';
  const line = `\n- ${record.ts} [${record.phase || 'general'}] ${record.agent || 'unknown'}${target}: ${record.message || ''}${record.artifact ? ` (${record.artifact})` : ''}\n`;
  await writeTextAtomic(files.live, trimLiveMarkdown(`${current.trimEnd()}${line}`));
  return record;
}

export async function readTeamControl(dir) {
  return readJson(teamLogPaths(dir).control, defaultTeamControl(path.basename(dir)));
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
    final_message: opts.finalMessage || 'Team session ended. Lane follow loops may stop; Warp panes remain user-controlled.'
  };
  await writeJsonAtomic(files.control, next);
  return next;
}

export function teamCleanupRequested(control = {}) {
  return Boolean(control?.cleanup_requested || control?.status === 'cleanup_requested' || control?.status === 'ended');
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
    control.final_message || 'Team session ended. Warp panes remain user-controlled.'
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
  const assignedTasks = runtimeTasks.filter((task) => task?.worker === agent || task?.agent_hint === agent);
  const eventWindow = await readTeamTranscriptTail(dir, Math.max(lines * 8, 80));
  const parsedWindow = eventWindow.map(parseTranscriptLine).filter(Boolean);
  const agentEvents = parsedWindow.filter((event) => event?.agent === agent || eventAddressedTo(event, agent)).slice(-lines);
  const directMessages = parsedWindow.filter((event) => event?.type === 'message' && eventAddressedTo(event, agent)).slice(-lines);
  const globalTail = (await readTeamTranscriptTail(dir, lines)).map(parseTranscriptLine).filter(Boolean);
  const laneStyle = teamLaneTextStyle(agent);
  return [
    `# SKS Team Agent Lane`,
    '',
    `Mission: ${missionId}`,
    `Agent: ${agent}`,
    `Lane color: ${laneStyle.color_name}`,
    `Requested phase: ${phase || 'any'}`,
    teamCleanupRequested(control) ? `Cleanup: requested at ${control.cleanup_requested_at || 'unknown'}` : null,
    '',
    `## Agent Status`,
    `- status: ${status.status || 'pending'}`,
    `- phase: ${status.phase || 'unknown'}`,
    `- last_seen: ${status.last_seen || 'never'}`,
    '',
    `## Assigned Runtime Tasks`,
    ...(runtime ? formatRuntimeTasks(assignedTasks) : ['- team-runtime-tasks.json not available yet.']),
    '',
    `## Recent Agent Events`,
    ...(agentEvents.length ? agentEvents.map(formatTranscriptEvent) : ['- No recent agent-specific events in the bounded tail.']),
    '',
    `## Direct Messages`,
    ...(directMessages.length ? directMessages.map(formatTranscriptEvent) : ['- No direct or broadcast messages in the bounded tail.']),
    '',
    `## Fallback Global Tail`,
    ...(globalTail.length ? globalTail.map(formatTranscriptEvent) : ['- No transcript events yet.']),
    teamCleanupRequested(control) ? ['', renderTeamCleanupSummary(control)].join('\n') : null
  ].filter((line) => line !== null).join('\n');
}

export async function renderTeamWatch(dir, opts = {}) {
  const lines = Math.max(1, Number(opts.lines) || 20);
  const dashboard = await readTeamDashboard(dir);
  const control = await readTeamControl(dir);
  const runtime = await readJson(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), null);
  const missionId = opts.missionId || dashboard?.mission_id || runtime?.mission_id || path.basename(dir);
  const agents = Object.entries(dashboard?.agents || {});
  const visibleAgents = agents
    .filter(([name]) => name !== 'parent_orchestrator')
    .slice(0, Math.max(3, Number(dashboard?.agent_session_count) || 3));
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
    '- Neighbor warp panes follow individual `sks team lane ... --agent <name>` views.',
    '- Use `sks team event ...` to mirror scout, debate, executor, review, and verification status into the live panes.',
    '- Use `sks team message ... --from <agent> --to <agent|all>` for bounded inter-agent communication in transcript/lane views.',
    '- Use `sks team cleanup-warp ...` at session end; follow loops show cleanup and exit while Warp panes remain user-controlled.',
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

function eventAddressedTo(event = {}, agent = '') {
  if (!event?.to) return false;
  const target = String(event.to || '').trim().toLowerCase();
  const name = String(agent || '').trim().toLowerCase();
  return target === name || target === 'all' || target === '*' || target === 'broadcast';
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

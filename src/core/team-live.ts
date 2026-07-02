import { MAX_AGENT_COUNT } from './agents/agent-schema.js';
import { MIN_TEAM_REVIEWER_LANES } from './team-review-policy.js';

export { MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_POLICY_TEXT, MIN_TEAM_REVIEW_STAGE_AGENT_SESSIONS, evaluateTeamReviewPolicyGate, teamReviewPolicy } from './team-review-policy.js';

export const DEFAULT_TEAM_ROLE_COUNTS = { user: 1, planner: 1, reviewer: MIN_TEAM_REVIEWER_LANES, executor: 3 };
export const MAX_TEAM_AGENT_SESSIONS = MAX_AGENT_COUNT;
export const DEFAULT_MAX_TEAM_AGENT_SESSIONS = MAX_TEAM_AGENT_SESSIONS;

const ROLE_ALIASES: Record<string, string> = {
  user: 'user',
  users: 'user',
  customer: 'user',
  client: 'user',
  planner: 'planner',
  planners: 'planner',
  architect: 'planner',
  lead: 'planner',
  executor: 'executor',
  executors: 'executor',
  implementer: 'executor',
  developer: 'executor',
  dev: 'executor',
  reviewer: 'reviewer',
  reviewers: 'reviewer',
  critic: 'reviewer',
  qa: 'reviewer',
  verifier: 'reviewer'
};

export function normalizeTeamAgentSessions(value: any, fallback: any = 3) {
  const n = Number(value ?? fallback);
  const fallbackNumber = Number(fallback);
  const fallbackCount = Number.isFinite(fallbackNumber) ? Math.floor(fallbackNumber) : 3;
  return Math.min(MAX_TEAM_AGENT_SESSIONS, Math.max(1, Number.isFinite(n) ? Math.floor(n) : fallbackCount));
}

export function parseTeamSpecArgs(args: any = []) {
  const cleanArgs: string[] = [];
  let roleCounts: Record<string, number> = { ...DEFAULT_TEAM_ROLE_COUNTS };
  let explicitSession: any = null;
  let explicitExecutor = false;

  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    const parsed = parseBudgetOrRoleToken(arg, roleCounts, explicitExecutor, explicitSession);
    if (parsed.consumed) {
      roleCounts = parsed.roleCounts;
      explicitExecutor = parsed.explicitExecutor;
      explicitSession = parsed.explicitSession;
      continue;
    }
    if (/^--(?:agents|sessions|team-size)$/.test(arg)) {
      explicitSession = normalizeTeamAgentSessions(args[i + 1]);
      if (!explicitExecutor) roleCounts.executor = explicitSession;
      i++;
      continue;
    }
    if (/^--(?:max-agents|max-sessions|max-team)$/.test(arg)) {
      explicitSession = DEFAULT_MAX_TEAM_AGENT_SESSIONS;
      if (!explicitExecutor) roleCounts.executor = DEFAULT_MAX_TEAM_AGENT_SESSIONS;
      continue;
    }
    if (/^--(?:work-items|target-active-slots|minimum-work-items|max-queue-expansion|ollama-model|local-model-model|ollama-base-url|local-model-base-url)$/.test(arg)) {
      i++;
      continue;
    }
    if (/^--(?:work-items|target-active-slots|minimum-work-items|max-queue-expansion)=/.test(arg)) continue;
    if (/^--(?:ollama-model|local-model-model|ollama-base-url|local-model-base-url)=/.test(arg)) continue;
    if (/^--(?:json|open-zellij|zellij-open|no-open-zellij|no-zellij|no-attach|separate-session|new-session|legacy-team-session|ollama|local-model|no-ollama|no-local-model)$/.test(arg)) continue;
    const consumed = consumeTeamSpecText(arg, { roleCounts, explicitExecutor, explicitSession });
    roleCounts = consumed.roleCounts;
    explicitExecutor = consumed.explicitExecutor;
    explicitSession = consumed.explicitSession;
    if (consumed.prompt) cleanArgs.push(consumed.prompt);
  }

  return { cleanArgs, ...normalizeTeamSpec({ roleCounts, agentSessions: explicitSession }) };
}

export function parseTeamSpecText(text: any = '') {
  const wantsMaxAgents = /\b(max|maximum|maximal|available agents?)\b|최대|가용가능/i.test(String(text || ''));
  const consumed = consumeTeamSpecText(text, { roleCounts: { ...DEFAULT_TEAM_ROLE_COUNTS }, explicitExecutor: false, explicitSession: null });
  if (wantsMaxAgents && !consumed.explicitExecutor) consumed.roleCounts.executor = DEFAULT_MAX_TEAM_AGENT_SESSIONS;
  return {
    prompt: consumed.prompt,
    ...normalizeTeamSpec({
      roleCounts: consumed.roleCounts,
      agentSessions: consumed.explicitSession ?? (wantsMaxAgents ? consumed.roleCounts.executor : undefined),
      prompt: consumed.prompt
    })
  };
}

export function normalizeTeamSpec(opts: any = {}) {
  const roleCounts = normalizeTeamRoleCounts(opts.roleCounts);
  if (opts.agentSessions !== undefined && (!opts.roleCounts || opts.roleCounts.executor === undefined)) {
    roleCounts.executor = normalizeTeamAgentSessions(opts.agentSessions, roleCounts.executor);
  }
  const bundleSize = normalizeTeamAgentSessions(roleCounts.executor, DEFAULT_TEAM_ROLE_COUNTS.executor);
  const agentSessions = Math.max(normalizeTeamAgentSessions(opts.agentSessions ?? bundleSize), normalizeTeamAgentSessions(roleCounts.reviewer, MIN_TEAM_REVIEWER_LANES));
  return { agentSessions, bundleSize, roleCounts, roster: buildTeamRoster(roleCounts) };
}

export function normalizeTeamRoleCounts(input: any = {}) {
  const counts: Record<string, number> = { ...DEFAULT_TEAM_ROLE_COUNTS };
  for (const [key, value] of Object.entries(input || {})) {
    const role = normalizeTeamRole(key);
    if (role) counts[role] = normalizeTeamAgentSessions(value, counts[role] || 1);
  }
  counts.reviewer = Math.max(MIN_TEAM_REVIEWER_LANES, counts.reviewer ?? 0);
  return counts;
}

export function buildTeamRoster(roleCounts: any = DEFAULT_TEAM_ROLE_COUNTS) {
  const counts = normalizeTeamRoleCounts(roleCounts);
  const bundleSize = normalizeTeamAgentSessions(counts.executor);
  const numbered = (prefix: string, count: any, role = prefix) =>
    Array.from({ length: normalizeTeamAgentSessions(count, 1) }, (_: any, i: number) => ({ id: `${prefix}_${i + 1}`, role, index: i + 1 }));
  const analysis = numbered('native_agent', bundleSize, 'analysis');
  const debate = [...numbered('debate_user', counts.user, 'user'), ...numbered('debate_planner', counts.planner, 'planner'), ...numbered('debate_reviewer', counts.reviewer, 'reviewer'), ...numbered('debate_executor', bundleSize, 'executor')].slice(0, bundleSize);
  const development = numbered('executor', bundleSize, 'executor');
  const validation = [...numbered('reviewer', counts.reviewer, 'reviewer'), ...numbered('user', counts.user, 'user')];
  return { role_counts: counts, bundle_size: bundleSize, analysis_team: analysis, debate_team: debate, development_team: development, validation_team: validation, all_agents: [...analysis, ...debate, ...development, ...validation] };
}

export function formatRoleCounts(roleCounts: any = DEFAULT_TEAM_ROLE_COUNTS) {
  return Object.entries(normalizeTeamRoleCounts(roleCounts)).map(([role, count]) => `${role}:${count}`).join(' ');
}

function parseBudgetOrRoleToken(token: string, roleCounts: Record<string, number>, explicitExecutor: boolean, explicitSession: any) {
  const state = { consumed: false, roleCounts, explicitExecutor, explicitSession };
  const budget = token.match(/^(\d+):(agents?|sessions?|team)$/i);
  if (budget) {
    const count = normalizeTeamAgentSessions(budget[1], DEFAULT_TEAM_ROLE_COUNTS.executor);
    if (!explicitExecutor) state.roleCounts = { ...roleCounts, executor: count };
    return { ...state, consumed: true, explicitSession: count };
  }
  const rolePair = token.match(/^(?:--)?([A-Za-z][A-Za-z_-]*)(?::|=)(\d+)$/);
  const role = rolePair ? normalizeTeamRole(rolePair[1]) : null;
  if (!rolePair || !role) return state;
  const count = normalizeTeamAgentSessions(rolePair[2], (DEFAULT_TEAM_ROLE_COUNTS as Record<string, number>)[role] || 1);
  return { consumed: true, roleCounts: { ...roleCounts, [role]: count }, explicitExecutor: explicitExecutor || role === 'executor', explicitSession };
}

function consumeTeamSpecText(text: any, state: any) {
  let roleCounts: Record<string, number> = { ...(state.roleCounts || DEFAULT_TEAM_ROLE_COUNTS) };
  let explicitExecutor = state.explicitExecutor === true;
  let explicitSession = state.explicitSession ?? null;
  const prompt = String(text || '')
    .replace(/\b(\d+):(agents?|sessions?|team)\b/gi, (token) => {
      const parsed = parseBudgetOrRoleToken(token, roleCounts, explicitExecutor, explicitSession);
      roleCounts = parsed.roleCounts;
      explicitExecutor = parsed.explicitExecutor;
      explicitSession = parsed.explicitSession;
      return parsed.consumed ? '' : token;
    })
    .replace(/\b([A-Za-z][A-Za-z_-]*):(\d+)\b/g, (token) => {
      const parsed = parseBudgetOrRoleToken(token, roleCounts, explicitExecutor, explicitSession);
      roleCounts = parsed.roleCounts;
      explicitExecutor = parsed.explicitExecutor;
      explicitSession = parsed.explicitSession;
      return parsed.consumed ? '' : token;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { prompt, roleCounts, explicitExecutor, explicitSession };
}

function normalizeTeamRole(role: any) {
  return ROLE_ALIASES[String(role || '').trim().toLowerCase().replace(/[^a-z_-]/g, '')] || null;
}

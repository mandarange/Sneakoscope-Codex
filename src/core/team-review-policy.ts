export const MIN_TEAM_REVIEWER_LANES = 5;
export const MIN_TEAM_REVIEW_STAGE_AGENT_SESSIONS = MIN_TEAM_REVIEWER_LANES;
export const MIN_TEAM_REVIEW_POLICY_TEXT = `Minimum Team review policy: run at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes before integration or final, even when the requested reviewer role count is lower.`;
export const DEFAULT_OFFICIAL_REVIEWER_LANES = 1;
export const MAX_AUTOMATIC_OFFICIAL_REVIEWER_LANES = 2;
export const MAX_CRITICAL_OFFICIAL_REVIEWER_LANES = 3;
export const OFFICIAL_SUBAGENT_REVIEW_POLICY_TEXT = 'Official subagent review policy: start with one focused reviewer, expand to two only for independent review domains, and use at most three automatic reviewers for critical multi-domain risk. The parent owns integration and may honor a larger explicit operator request.';

export function officialSubagentReviewLaneBudget(input: { independentDomains?: number; critical?: boolean; explicit?: number | null } = {}) {
  if (Number.isFinite(Number(input.explicit)) && Number(input.explicit) > 0) {
    return { requested: Math.floor(Number(input.explicit)), source: 'explicit_operator' as const };
  }
  const domains = Math.max(0, Math.floor(Number(input.independentDomains || 0)));
  const ceiling = input.critical === true ? MAX_CRITICAL_OFFICIAL_REVIEWER_LANES : MAX_AUTOMATIC_OFFICIAL_REVIEWER_LANES;
  return {
    requested: Math.max(DEFAULT_OFFICIAL_REVIEWER_LANES, Math.min(ceiling, domains || DEFAULT_OFFICIAL_REVIEWER_LANES)),
    source: 'risk_scoped_automatic' as const
  };
}

function numericCount(value: any, fallback: any = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

export function teamReviewPolicy() {
  return {
    gate: 'team_review_policy',
    minimum_reviewer_lanes: MIN_TEAM_REVIEWER_LANES,
    minimum_review_stage_agent_sessions: MIN_TEAM_REVIEW_STAGE_AGENT_SESSIONS,
    text: MIN_TEAM_REVIEW_POLICY_TEXT
  };
}

export function teamValidationReviewerCount(roster: any = {}) {
  const validation = Array.isArray(roster?.validation_team) ? roster.validation_team : [];
  return validation.filter((agent: any) => {
    const id = String(agent?.id || agent || '');
    const role = String(agent?.role || '');
    return /review|qa|validation/i.test(`${role} ${id}`);
  }).length;
}

export function evaluateTeamReviewPolicyGate({ roleCounts = {}, agentSessions = 0, roster = {} }: any = {}) {
  const requestedReviewerLanes = numericCount(roleCounts.reviewer);
  const requiredReviewerLanes = Math.max(MIN_TEAM_REVIEWER_LANES, requestedReviewerLanes);
  const validationReviewerLanes = teamValidationReviewerCount(roster);
  const sessionCount = numericCount(agentSessions);
  const blockers: any[] = [];

  if (requestedReviewerLanes < MIN_TEAM_REVIEWER_LANES) blockers.push('role_counts.reviewer_below_minimum');
  if (validationReviewerLanes < requiredReviewerLanes) blockers.push('validation_team_reviewers_below_required');
  if (sessionCount < requiredReviewerLanes) blockers.push('agent_sessions_below_review_required');

  return {
    gate: 'team_review_policy',
    passed: blockers.length === 0,
    blockers,
    minimum_reviewer_lanes: MIN_TEAM_REVIEWER_LANES,
    required_reviewer_lanes: requiredReviewerLanes,
    requested_reviewer_lanes: requestedReviewerLanes,
    validation_reviewer_lanes: validationReviewerLanes,
    agent_sessions: sessionCount
  };
}

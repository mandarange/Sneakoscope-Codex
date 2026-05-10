export const MIN_TEAM_REVIEWER_LANES = 5;
export const MIN_TEAM_REVIEW_STAGE_AGENT_SESSIONS = MIN_TEAM_REVIEWER_LANES;
export const MIN_TEAM_REVIEW_POLICY_TEXT = `Minimum Team review policy: run at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes before integration or final, even when the requested reviewer role count is lower.`;

function numericCount(value, fallback = 0) {
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

export function teamValidationReviewerCount(roster = {}) {
  const validation = Array.isArray(roster?.validation_team) ? roster.validation_team : [];
  return validation.filter((agent) => {
    const id = String(agent?.id || agent || '');
    const role = String(agent?.role || '');
    return /review|qa|validation/i.test(`${role} ${id}`);
  }).length;
}

export function evaluateTeamReviewPolicyGate({ roleCounts = {}, agentSessions = 0, roster = {} } = {}) {
  const requestedReviewerLanes = numericCount(roleCounts.reviewer);
  const requiredReviewerLanes = Math.max(MIN_TEAM_REVIEWER_LANES, requestedReviewerLanes);
  const validationReviewerLanes = teamValidationReviewerCount(roster);
  const sessionCount = numericCount(agentSessions);
  const blockers = [];

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

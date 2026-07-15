export const DEFAULT_OFFICIAL_REVIEWER_LANES = 1;
export const MAX_AUTOMATIC_OFFICIAL_REVIEWER_LANES = 2;
export const MAX_CRITICAL_OFFICIAL_REVIEWER_LANES = 3;

export const OFFICIAL_SUBAGENT_REVIEW_POLICY_TEXT =
  'Official subagent review policy: start with one focused reviewer, expand to two only for independent review domains, and use at most three automatic reviewers for critical multi-domain risk. The parent owns integration and may honor a larger explicit operator request.';

export function officialSubagentReviewLaneBudget(
  input: { independentDomains?: number; critical?: boolean; explicit?: number | null } = {}
) {
  if (Number.isFinite(Number(input.explicit)) && Number(input.explicit) > 0) {
    return { requested: Math.floor(Number(input.explicit)), source: 'explicit_operator' as const };
  }

  const domains = Math.max(0, Math.floor(Number(input.independentDomains || 0)));
  const ceiling = input.critical === true
    ? MAX_CRITICAL_OFFICIAL_REVIEWER_LANES
    : MAX_AUTOMATIC_OFFICIAL_REVIEWER_LANES;

  return {
    requested: Math.max(
      DEFAULT_OFFICIAL_REVIEWER_LANES,
      Math.min(ceiling, domains || DEFAULT_OFFICIAL_REVIEWER_LANES)
    ),
    source: 'risk_scoped_automatic' as const
  };
}

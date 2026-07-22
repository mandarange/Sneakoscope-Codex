/** Retired Codex Desktop profile table / `<name>.config.toml` names stripped on migrate/doctor. */
export const RETIRED_SKS_CONFIG_PROFILE_NAMES = Object.freeze([
  'sks-team',
  // Legacy GLM Desktop picker profiles — OpenRouter is activated via provider + top-level model only.
  'sks-glm-52-mad',
  'sks-glm-52-minimal',
  'sks-glm-52-low',
  'sks-glm-52-medium',
  'sks-glm-52-high',
  'sks-glm-52-xhigh'
] as const)

export const RETIRED_AUTO_REVIEW_POLICY_TEXTS = new Set([
  'In MAD-SKS launches, allow only scoped non-MadDB high-risk work approved for the active invocation and keep catastrophic DB wipe/all-row safeguards active. In first-class MAD-DB cycles, the explicit $MAD-DB or sks mad-db run|exec|apply-migration invocation is the SQL-plane approval boundary: execute requested execute_sql/apply_migration mutations with mission-local write transport, read-back proof, and final read-only restoration. Supabase project/account/billing/credential control-plane actions remain denied.',
  'In MAD-SKS launches, allow only the scoped non-MadDB high-risk surfaces approved for the active invocation and keep catastrophic DB wipe/all-row safeguards active. In first-class MAD-DB cycles, the explicit $MAD-DB or sks mad-db run|exec|apply-migration invocation is the SQL-plane approval boundary: execute requested execute_sql/apply_migration mutations with mission-local write transport, read-back proof, and final read-only restoration. Supabase project/account/billing/credential control-plane actions remain denied.'
])

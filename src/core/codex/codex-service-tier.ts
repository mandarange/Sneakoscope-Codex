/**
 * Codex's own service tier ids. The model catalog of every supported Codex lists `priority` for the
 * Fast tier (`service_tiers: [{ id: "priority", name: "Fast" }]`) and the config schema says
 * "`default`, `priority`, or `flex`; legacy `fast` also works". SKS keeps `fast` / `standard` as its own
 * vocabulary for policy and reports, and reads `fast`, `priority`, `standard` and `default` from existing
 * settings, but what it WRITES for Codex (config files, `-c` overrides, SDK config) is the canonical id.
 */
export type CodexServiceTierId = 'priority' | 'default'

export function codexServiceTierId(tier: 'fast' | 'standard'): CodexServiceTierId {
  return tier === 'fast' ? 'priority' : 'default'
}

/** The value written for Codex when Fast is on. */
export const CODEX_FAST_SERVICE_TIER_ID: CodexServiceTierId = codexServiceTierId('fast')

export const GATE_MANIFEST_SCHEMA = 'sks.release-gate-manifest.v1'

export type GateTier = 'P0' | 'P1' | 'P2'
export type GateCost = 'hermetic' | 'real' | 'heavy'

export interface GateManifestEntry {
  id: string
  tier: GateTier
  cost: GateCost
  affected_by: string[]
  always_on_release: boolean
  required_for_publish: boolean
  can_run_incremental: boolean
  safe_subgate?: string | undefined
}

export const FORBIDDEN_RECURSIVE_GATES = new Set<string>([
  'release:check',
  'release:check:parallel',
  'release:check:dynamic',
  'release:check:dynamic:execute',
  'release:real-check',
  'release:publish',
  'publish:npm',
  'publish:dry',
  'prepublishOnly'
])

// Gates that always run on a release check regardless of which files changed.
export const ALWAYS_ON_GATES = new Set<string>([
  'release:metadata',
  'release:readiness',
  'release:gate-existence-audit',
  'architecture:guard',
  'runtime:dist-parity',
  'runtime:ts-source-of-truth',
  'runtime:no-src-mjs',
  'runtime:no-tmux',
  'runtime:ts-rust-boundary',
  'safety:side-effect-zero',
  'safety:mutation-callsite-coverage:repo-wide',
  'side-effect:runtime-report',
  'core-skill:no-inference-optimizer',
  'core-skill:heldout-validation',
  'core-skill:deployment-snapshot',
  'core-skill:legacy-promotion-api-audit',
  'postinstall:safe-side-effects',
  'publish:packlist-performance',
  'legacy:upgrade-zero-break',
  'release:version-truth',
  'release:dynamic-performance',
  'release:provenance',
  'changelog:check'
])

// Gates that must never be skipped when planning for publish.
export const REQUIRED_FOR_PUBLISH = new Set<string>([
  'release:metadata',
  'architecture:guard',
  'runtime:dist-parity',
  'runtime:ts-rust-boundary',
  'safety:side-effect-zero',
  'safety:mutation-callsite-coverage:repo-wide',
  'side-effect:runtime-report',
  'release:version-truth',
  'release:provenance',
  'publish:packlist-performance',
  'postinstall:safe-side-effects',
  'legacy:upgrade-zero-break',
  'core-skill:card-schema',
  'core-skill:patch',
  'core-skill:heldout-validation',
  'core-skill:deployment-snapshot',
  'core-skill:no-inference-optimizer',
  'core-skill:rollout-scoring',
  'zellij:launch-command-truth',
  'zellij:ui-design'
])

const P0_PREFIXES = ['architecture:', 'core-skill:', 'safety:', 'side-effect:', 'runtime:', 'release:', 'legacy:', 'publish:', 'postinstall:', 'zellij:']

function tierFor(id: string): GateTier {
  if (P0_PREFIXES.some((p) => id.startsWith(p))) return 'P0'
  return 'P1'
}

function costFor(id: string): GateCost {
  if (id.includes(':require-real') || id.includes(':actual') || id.startsWith('agent:real-codex') || id.includes('real-session') || id === 'zellij:pane-proof' || id === 'zellij:screen-proof' || id === 'publish:dry-run-performance') {
    return 'real'
  }
  return 'hermetic'
}

/** Heuristic mapping from a gate id to the source globs that affect it. */
export function affectedGlobsFor(id: string): string[] {
  const prefix = id.split(':')[0]
  switch (prefix) {
    case 'architecture':
      return ['src/core/safety/ssot-guard.ts', 'src/core/pipeline-internals/runtime-core.ts', 'src/core/pipeline-internals/runtime-gates.ts', 'src/core/commands/team-command.ts', 'src/scripts/release-parallel-check.ts', 'scripts/architecture-guard-check.mjs', 'docs/architecture-ts-rust-boundary.md', 'package.json']
    case 'core-skill':
      return ['src/core/skills/**', 'schemas/skills/**', 'scripts/core-skill-*.mjs']
    case 'zellij':
      return ['src/core/zellij/**', 'scripts/zellij-*.mjs', 'templates/zellij/**', 'src/core/agents/zellij-lane-supervisor.ts']
    case 'safety':
      return ['src/core/safety/**', 'scripts/side-effect-zero-gate-check.mjs', 'scripts/mutation-callsite-coverage-check.mjs', 'safety-mutation-allowlist.json']
    case 'side-effect':
      return ['src/core/safety/**', 'scripts/side-effect-runtime-report-check.mjs', '.sneakoscope/missions/**/mutation-ledger.jsonl', '.sneakoscope/mutation-ledger.jsonl']
    case 'legacy':
      return ['src/core/migration/**', 'src/core/codex/**', 'src/core/init.ts', 'src/cli/install-helpers.ts', 'scripts/legacy-upgrade-matrix-check.mjs']
    case 'publish':
      return ['package.json', '.npmignore', 'scripts/packlist-performance-check.mjs', 'scripts/npm-publish-performance-check.mjs', 'dist/**']
    case 'postinstall':
      return ['src/cli/install-helpers.ts', 'src/core/init.ts', 'scripts/postinstall-safe-side-effects-check.mjs']
    case 'runtime':
      return ['src/**', 'scripts/runtime-*.mjs', 'scripts/build-dist.mjs', 'scripts/clean-dist.mjs', 'package.json']
    case 'agent':
    case 'team':
    case 'research':
    case 'qa':
    case 'naruto':
      return ['src/core/agents/**', 'src/core/commands/**', `scripts/${prefix}-*.mjs`]
    case 'codex':
    case 'codex-app':
    case 'codex-lb':
      return ['src/core/codex/**', 'src/core/codex-app.ts', 'src/core/codex-lb-circuit.ts', `scripts/${prefix}-*.mjs`]
    case 'release':
      return ['src/core/release/**', 'src/scripts/release-parallel-check.ts', 'scripts/release-*.mjs', 'package.json']
    default:
      return [`scripts/${prefix}-*.mjs`, `scripts/${id.replace(/:/g, '-')}-*.mjs`]
  }
}

export function buildGateEntry(id: string): GateManifestEntry {
  return {
    id,
    tier: tierFor(id),
    cost: costFor(id),
    affected_by: affectedGlobsFor(id),
    always_on_release: ALWAYS_ON_GATES.has(id),
    required_for_publish: REQUIRED_FOR_PUBLISH.has(id),
    can_run_incremental: costFor(id) === 'hermetic'
  }
}

export function buildGateManifest(gateIds: string[]): { schema: string; gates: GateManifestEntry[] } {
  const seen = new Set<string>()
  const gates: GateManifestEntry[] = []
  for (const id of gateIds) {
    if (seen.has(id)) continue
    seen.add(id)
    gates.push(buildGateEntry(id))
  }
  gates.sort((a, b) => a.id.localeCompare(b.id))
  return { schema: GATE_MANIFEST_SCHEMA, gates }
}

/** Parity between the manifest and the actual release-gate set. */
export function validateManifestParity(manifestGateIds: string[], releaseGateIds: string[]): { ok: boolean; missing_from_manifest: string[]; missing_from_release: string[] } {
  const manifest = new Set(manifestGateIds)
  const release = new Set(releaseGateIds)
  const missingFromManifest = [...release].filter((id) => !manifest.has(id))
  const missingFromRelease = [...manifest].filter((id) => !release.has(id))
  return { ok: missingFromManifest.length === 0 && missingFromRelease.length === 0, missing_from_manifest: missingFromManifest, missing_from_release: missingFromRelease }
}

function globToRegExp(glob: string): RegExp {
  return new RegExp(
    '^' +
      glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '__DOUBLE_STAR__')
        .replace(/\*/g, '[^/]*')
        .replace(/__DOUBLE_STAR__/g, '.*') +
      '$'
  )
}

export function gateMatchesChange(entry: GateManifestEntry, changedFiles: string[]): boolean {
  if (entry.always_on_release) return true
  const regexes = entry.affected_by.map(globToRegExp)
  return changedFiles.some((file) => regexes.some((re) => re.test(file)))
}

/** Select which gates to run given changed files. Always-on gates are always selected. */
export function selectGates(gates: GateManifestEntry[], changedFiles: string[], opts: { publish?: boolean } = {}): { selected: GateManifestEntry[]; skipped: Array<{ id: string; reason: string }> } {
  const selected: GateManifestEntry[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  for (const entry of gates) {
    if (opts.publish && entry.required_for_publish) {
      selected.push(entry)
      continue
    }
    if (gateMatchesChange(entry, changedFiles)) selected.push(entry)
    else skipped.push({ id: entry.id, reason: entry.always_on_release ? 'always_on' : 'no_affected_files_changed' })
  }
  return { selected, skipped }
}

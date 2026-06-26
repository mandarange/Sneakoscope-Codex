#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'
import { REQUIRED_3113_REAL_CHECK_IDS, REQUIRED_3113_RELEASE_IDS } from './release-3113-required-gates.js'
import { REQUIRED_4000_REAL_CHECK_IDS, REQUIRED_4000_RELEASE_IDS } from './release-4000-required-gates.js'
import { REQUIRED_4001_REAL_CHECK_IDS, REQUIRED_4001_RELEASE_IDS } from './release-4001-required-gates.js'
import { REQUIRED_4002_REAL_CHECK_IDS, REQUIRED_4002_RELEASE_IDS } from './release-4002-required-gates.js'

interface PackageJsonShape {
  scripts?: Record<string, string>
}

interface ReleaseGate {
  id: string
  command: string
  deps: string[]
  resource: string[]
  side_effect: string
  timeout_ms: number
  cache: unknown
  isolation: unknown
  preset: string[]
}

interface ReleaseGateManifest {
  gates: ReleaseGate[]
}

const pkg = readPackageJson(path.join(root, 'package.json'))
const manifest = readReleaseGateManifest(path.join(root, 'release-gates.v2.json'))
const scripts = pkg.scripts || {}
const legacy = String(scripts['release:check:legacy'] || '')
const legacyIds = [...new Set<string>(
  [...legacy.matchAll(/npm run ([^\s&]+)/g)]
    .map((match: RegExpMatchArray) => String(match[1] || ''))
    .filter((id: string) => Boolean(scripts[id]))
)]
const allowlist = new Map<string, string>([
  ['release:check:parallel', 'legacy aggregate superseded by release-gates.v2 DAG'],
  ['codex-app:fast-ui-preservation', 'Codex App UI real-environment preservation gate'],
  ['codex-control:keepalive-no-cot-leak', 'long-running remote keepalive/debug gate'],
  ['zellij:real-session-heartbeat', 'real Zellij heartbeat covered by release:real-check'],
  ['publish:packlist-performance', 'publish/package performance gate'],
  ['release:dynamic-performance', 'performance budget gate covered by release:parallel-speed-budget']
])
const gateIds = new Set<string>(manifest.gates.map((gate: ReleaseGate) => gate.id))
const releasePresetIds = new Set<string>(manifest.gates.filter((gate: ReleaseGate) => Array.isArray(gate.preset) && gate.preset.includes('release')).map((gate: ReleaseGate) => gate.id))
const realCheckPresetIds = new Set<string>(manifest.gates.filter((gate: ReleaseGate) => Array.isArray(gate.preset) && (gate.preset.includes('real-check') || gate.preset.includes('strict-release'))).map((gate: ReleaseGate) => gate.id))
const requiredReleasePresetIds = [
  'zellij:first-slot-down-stack',
  'zellij:slot-renderer-proof-semantics',
  'zellij:slot-telemetry',
  'zellij:slot-telemetry-runtime',
  'zellij:slot-pane-telemetry-renderer',
  'zellij:slot-column-anchor-telemetry',
  'agent:slot-telemetry-wiring',
  'zellij:slot-telemetry-renderer',
  'naruto:allocation-policy',
  'naruto:rebalance-policy',
  'naruto:allocation-runtime-wiring',
  'naruto:actual-worker-control-plane',
  'naruto:orchestrator-runtime-source',
  'git:worktree-checkpoint',
  'git:worktree-cross-rebase',
  'local-collab:worktree-gpt-final-apply-policy',
  'release:cache-glob-hashing',
  'release:runtime-truth-matrix',
  'zellij:stacked-version-matrix',
  'zellij:stacked-capability-routing',
  'zellij:pane-lock-concurrency-blackbox',
  'release:cache-version-neutral-fixtures',
  'agent:message-bus-reader',
  'runtime:proof-summary-messages',
  'zellij:update-prompt-matrix',
  'release:proof-truth',
  'release:dag-full-coverage',
  'research:quality-contract',
  'research:claim-matrix',
  'research:source-quality-report',
  'research:implementation-blueprint',
  'research:experiment-plan',
  'research:replication-pack',
  'research:final-reviewer',
  'research:work-graph',
  'research:short-report-rejection',
  'research:complete-package-fixture',
  'research:stage-cycle-runtime-blackbox',
  'research:final-reviewer-blackbox',
  'research:synthesis-writer',
  'research:synthesis-writer-blackbox',
  'research:repetition-detector',
  'research:template-report-rejection',
  'research:real-synthesis-no-deterministic-renderer',
  'research:handoff-consumability',
  'codex-sdk:research-pipeline',
  'release:affected-selector',
  'release:dynamic-presets',
  'release:batch-runner',
  'release:gate-batch-runner',
  'release:aggressive-resource-governor',
  'release:speed-summary',
  'release:speed-summary:check',
  'naruto:ssot-routing',
  'naruto:ssot-route-normalization',
  'naruto:ssot-default',
  'naruto:ssot-gate-aliases',
  'naruto:ssot-pipeline-default',
  'update:notice',
  'update:gate-removed',
  'update:mad-zellij-notice',
  'mad-db:capability',
  'mad-db:command',
  'mad-db:mad-command',
  'mad-db:priority-resolver',
  'mad-db:ledger',
  'mad-db:one-cycle-consumption',
  'mad-db:safety-conflict-matrix',
  'parallel:runtime-proof',
  'parallel:runtime-proof-events',
  'parallel:runtime-real-blackbox',
  'parallel:claim-enforcement',
  'scheduler:batch-dispatch',
  'scheduler:utilization-proof',
  'native-swarm:process-spawn-proof',
  'native-swarm:zellij-does-not-block-workers',
  'model-call:concurrency',
  'naruto:parallelism-mode',
  'naruto:visible-vs-active-workers',
  'naruto:parallel-runtime-proof',
  'naruto:real-parallelism-blackbox',
  'git:worktree-batch-allocation',
  'release:full-parallelism-blackbox',
  'zellij:slot-telemetry-incremental',
  'zellij:slot-telemetry-performance',
  'team:legacy-create-removed',
  'mad-db:one-cycle-bounded',
  'mad-db:operation-lifecycle-ledger',
  'mad-db:route-identity',
  'mad-db:hook-idempotency',
  'mad-db:direct-apply-migration-hook',
  'mad-db:parallel-lifecycle',
  'mad-db:runtime-profile',
  'mad-db:skill-policy',
  'mad-db:policy-v2',
  'parallel:strict-pid-proof',
  'parallel:missing-pid-rejection',
  'scheduler:utilization-integral',
  'scheduler:parallel-proof-consistency',
  'zellij:slot-telemetry-live-flush',
  'zellij:slot-pane-stale-detection',
  'mad-db:lifecycle-hook-decision',
  'mad-db:mcp-result-lifecycle',
  'mad-db:operation-lifecycle-blackbox',
  'runtime:proof-summary',
  'runtime:proof-summary-cli',
  'codex:0138-capability',
  'codex:0138-capability-artifact',
  'codex-sdk:version-compat',
  'codex-app:handoff',
  'qa-loop:app-handoff',
  'qa-loop:app-handoff-capability',
  'qa-loop:app-handoff-cli',
  'zellij:qa-app-handoff-status',
  'codex-plugin:json',
  'codex-plugin:inventory',
  'mcp:plugin-inventory',
  'codex-plugin:app-template-policy',
  'image:artifact-path-contract',
  'qa-loop:image-path-exposure',
  'image:generation-path-handoff',
  'image:followup-edit-path',
  'codex:effort-order',
  'qa-loop:effort-escalation',
  'codex:account-usage',
  'qa-loop:budget-policy',
  'naruto:parallel-gate-consistency',
  'codex:0138-doctor',
  'doctor:codex-0138-fix',
  'codex:0138-feature-probes',
  'codex:0139-capability',
  'codex:0139-feature-probes',
  'codex:0139-interrupt-agent',
  'codex:0139-rich-tool-schema',
  'codex:0139-doctor-env-redaction',
  'codex:0139-code-mode-web-search',
  'codex:0139-marketplace-source',
  'codex:0139-sandbox-profile-alias',
  'codex:0139-real-probes',
  'codex:0139-real-probe-summary',
  'doctor:codex-0139-real-probes',
  'zellij:fake-adapter',
  'zellij:pane-lock-open-worker-integration',
  'zellij:stacked-fallback-integration',
  'runtime:proof-zellij-stacked-summary',
  'naruto:proof-zellij-stacked-summary',
  'docs:codex-0139-wording',
  'codex-app:launcher',
  'codex-app:handoff-launch',
  'qa-loop:app-handoff-launch',
  'qa-loop:app-handoff-confirmation',
  'qa-loop:app-handoff-status-lifecycle',
  'qa-loop:app-handoff-gate-lifecycle',
  'codex-plugin:parallel-detail-fetch',
  'codex-plugin:cache',
  'codex-plugin:diff',
  'image:artifact-registry',
  'image:global-path-contract',
  'qa-loop:image-path-prompt-injection',
  'codex:model-metadata',
  'codex:effort-auto-discovery',
  'codex:account-usage-autodiscovery',
  'loop:schema',
  'loop:planner',
  'loop:runtime',
  'loop:gate-selector',
  'loop:lease',
  'loop:collision-blackbox',
  'naruto:loop-mesh',
  'naruto:loop-mesh-blackbox',
  'loop:cli',
  'loop:observability',
  'goal:loop-runtime-default',
  'goal:legacy-runtime-escape',
  'loop:fixture-policy',
  'loop:fixture-production-misuse-blackbox',
  'loop:final-arbiter-contract',
  'loop:gpt-final-contract-crossref',
  'loop:merge-strategy',
  'loop:merge-strategy-blackbox',
  'loop:side-effect-scanner',
  'loop:side-effect-blackbox',
  'loop:worker-interrupt',
  'loop:kill-interrupt-real-blackbox',
  'loop:concurrency-budget',
  'loop:concurrency-oversubscription-blackbox',
  'loop:mesh-production-e2e-blackbox',
  'changelog:loop-productionization',
  'lint:no-ts-nocheck-core',
  'codex-app:type-safety',
  'type-surface:codex-app',
  'zellij:self-heal',
  'zellij:self-heal-status-contract',
  'zellij:self-heal-dry-run',
  'zellij:self-heal-typed-blackbox',
  'doctor:zellij-fix-blackbox',
  'mad:zellij-self-heal-blackbox',
  'mad:zellij-no-contradictory-output',
  'brand-neutrality:zero-leakage',
  'brand-neutrality:zero-leakage-blackbox',
  'docs:brand-neutrality',
  'codex-native:feature-broker',
  'codex-native:invocation-router',
  'codex-native:route-map',
  'pipeline:codex-native-loop-routing',
  'pipeline:codex-native-qa-routing',
  'pipeline:codex-native-research-routing',
  'pipeline:codex-native-image-routing',
  'pipeline:codex-native-doctor-mad-routing',
  'codex-native:pattern-analysis',
  'codex-native:reference-evidence',
  'codex-native:pattern-analysis-blackbox',
  'codex-native:skill-content',
  'codex-native:agent-role-content',
  'codex-native:hook-lifecycle-proof',
  'init-deep:backup-retention',
  'init-deep:memory-scope-safety',
  'release-scripts:type-safe',
  'lint:no-ts-nocheck-release-scripts',
  'doctor:codex-native-readiness-ux',
  'codex-native:feature-broker-blackbox',
  'pipeline:codex-native-e2e-blackbox',
  'codex-app:harness-matrix',
  'codex-app:hook-approval-probe',
  'codex-app:hook-approval-matrix',
  'codex-app:hook-approval-blackbox',
  'codex-app:agent-type-probe',
  'codex-app:agent-type-routing',
  'codex-app:agent-type-blackbox',
  'doctor:codex-app-harness',
  'codex-app:skill-sync',
  'codex-app:skill-rich-content',
  'codex-app:agent-role-sync',
  'codex-app:agent-role-rich-content',
  'codex-app:init-deep',
  'codex-app:init-deep-managed-agents',
  'loop:planner-project-memory-deep',
  'codex-app:init-deep-directory-local-blackbox',
  'codex-app:hook-lifecycle',
  'codex-app:execution-profile',
  'loop:execution-profile-routing',
  'qa-loop:execution-profile-routing',
  'research:execution-profile-routing',
  'pipeline:execution-profile-routing-blackbox',
  'codex-native:harness-compat',
  'codex-native:invocation-defaults',
  'codex-native:interop-policy',
  'doctor:codex-native-repair-actions',
  'codex-app:harness-blackbox',
  'brand-neutrality:rename-map',
  'pipeline:codex-native-loop-routing-real-blackbox',
  'pipeline:codex-native-qa-routing-real-blackbox',
  'pipeline:codex-native-research-routing-real-blackbox',
  'pipeline:codex-native-image-routing-real-blackbox',
  'pipeline:codex-native-doctor-mad-routing-real-blackbox',
  'codex-native:reference-cache',
  'codex-native:reference-cache-blackbox',
  'codex-native:broker-read-only',
  'codex-native:repair-transaction',
  'codex-native:read-repair-split-blackbox',
  'brand-neutrality:generated-artifacts',
  'core-skill:manifest',
  'core-skill:immutable-sync',
  'core-skill:no-drift',
  'core-skill:integrity-blackbox',
  'skill:name-canonicalizer',
  'skill:registry-ledger',
  'skill:dedupe',
  'skill:sync-atomic',
  'skill:dedupe-blackbox',
  'native-capability:repair-matrix',
  'native-capability:repair',
  'native-capability:postcheck',
  'native:image-generation-repair',
  'native:computer-use-repair',
  'native:chrome-web-review-repair',
  'native:app-screenshot-repair',
  'doctor:native-capability-repair',
  'doctor:native-repair-output',
  'doctor:native-capability-repair-blackbox',
  'secret:preservation',
  'config:managed-merge',
  'secret:preservation-guard',
  'secret:supabase-preservation-blackbox',
  'update:preserves-supabase-keys',
  'update:secret-preservation-guard',
  'update:secret-migration-journal',
  'config:managed-merge-callsite-coverage',
  'release:gate-script-parity',
  'release:wiring-3110-blackbox',
  'sks:3110-all-feature-regression',
  'release:wiring-3112-blackbox',
  'codex:0140-capability',
  'codex:0140-feature-probes',
  'codex:0140-usage',
  'codex:0140-goal-attachment-preservation',
  'codex:0140-session-delete',
  'codex:0140-import',
  'codex:0140-unified-mentions',
  'codex:0140-bedrock-managed-auth',
  'codex:0140-mcp-reliability',
  'codex:0140-sqlite-recovery',
  'codex:0140-non-tty-interrupt',
  'codex:0140-large-repo-performance',
  'pipeline:codex-0140-integration',
  'codex:0140-integration-blackbox',
  'doctor:fix-production-blackbox',
  'doctor:startup-config-repair',
  'doctor:startup-config-repair-blackbox',
  'doctor:context7-mcp-repair',
  'doctor:context7-mcp-repair-blackbox',
  'doctor:supabase-mcp-repair',
  'doctor:supabase-mcp-repair-blackbox',
  'sks:3112-all-feature-regression',
  ...REQUIRED_3113_RELEASE_IDS,
  ...REQUIRED_4000_RELEASE_IDS,
  ...REQUIRED_4001_RELEASE_IDS,
  ...REQUIRED_4002_RELEASE_IDS
]
const requiredRealCheckPresetIds = [
  'codex:0139-real-probes:require-real',
  'codex:0139-code-mode-web-search-real',
  'codex:0139-rich-tool-schema-real',
  'codex:0139-doctor-env-real',
  'codex:0139-plugin-marketplace-real',
  'codex:0139-plugin-cache-real',
  'codex:0139-sandbox-profile-alias-real',
  'codex:0139-interrupt-agent-real',
  'codex:0139-image-path-real',
  'codex:0139-sandbox-proxy-real',
  'codex:0140-real-probes:require-real',
  ...REQUIRED_3113_REAL_CHECK_IDS,
  ...REQUIRED_4000_REAL_CHECK_IDS,
  ...REQUIRED_4001_REAL_CHECK_IDS,
  ...REQUIRED_4002_REAL_CHECK_IDS
]
const missing = legacyIds.filter((id: string) => !gateIds.has(id) && !allowlist.has(id))
const missingRequiredReleasePreset = requiredReleasePresetIds.filter((id: string) => !gateIds.has(id) || !releasePresetIds.has(id))
const missingRequiredRealCheckPreset = requiredRealCheckPresetIds.filter((id: string) => !gateIds.has(id) || !realCheckPresetIds.has(id))
const codex0139RequiredGates = requiredReleasePresetIds.filter((id: string) => id.startsWith('codex:0139'))
const codex0139MissingRequiredGates = codex0139RequiredGates.filter((id: string) => !gateIds.has(id) || !releasePresetIds.has(id))
const allowed = legacyIds.filter((id: string) => allowlist.has(id)).map((id: string) => ({ id, reason: allowlist.get(id) }))
const coverage = legacyIds.length ? (legacyIds.length - missing.length) / legacyIds.length : 1
const schemaComplete = manifest.gates.every((gate: ReleaseGate) => gate.id && gate.command && Array.isArray(gate.deps) && Array.isArray(gate.resource) && gate.side_effect && gate.timeout_ms && gate.cache && gate.isolation && Array.isArray(gate.preset))
const report = {
  schema: 'sks.release-dag-full-coverage-check.v1',
  ok: missing.length === 0 && missingRequiredReleasePreset.length === 0 && missingRequiredRealCheckPreset.length === 0 && coverage >= 0.95 && schemaComplete,
  legacy_gate_count: legacyIds.length,
  v2_gate_count: manifest.gates.length,
  coverage,
  missing,
  required_release_preset_ids: requiredReleasePresetIds,
  missing_required_release_preset: missingRequiredReleasePreset,
  required_real_check_preset_ids: requiredRealCheckPresetIds,
  missing_required_real_check_preset: missingRequiredRealCheckPreset,
  codex_0139_required_gates: codex0139RequiredGates,
  codex_0139_missing_required_gates: codex0139MissingRequiredGates,
  allowed,
  schema_complete: schemaComplete
}
assertGate(report.ok, 'release-gates.v2 must cover legacy hermetic release gates', report)
emitGate('release:dag-full-coverage', report)

function readPackageJson(file: string): PackageJsonShape {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!isRecord(parsed)) return {}
  const scripts = parsed.scripts
  if (!isRecord(scripts)) return {}
  return { scripts: Object.fromEntries(Object.entries(scripts).map(([key, value]) => [key, String(value)])) }
}

function readReleaseGateManifest(file: string): ReleaseGateManifest {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  assertGate(isRecord(parsed), 'release gate manifest must be an object', { file })
  if (!isRecord(parsed)) return { gates: [] }
  const gatesValue = parsed.gates
  assertGate(Array.isArray(gatesValue), 'release gate manifest missing gates array', { file })
  if (!Array.isArray(gatesValue)) return { gates: [] }
  const gatesRaw: unknown[] = gatesValue
  const gates = gatesRaw.filter(isReleaseGate)
  assertGate(gates.length === gatesRaw.length, 'release gate manifest contains invalid gates', {
    file,
    invalid_count: gatesRaw.length - gates.length
  })
  return { gates }
}

function isReleaseGate(value: unknown): value is ReleaseGate {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.command === 'string'
    && typeof value.side_effect === 'string'
    && typeof value.timeout_ms === 'number'
    && normalizeStringList(value.deps).length === (Array.isArray(value.deps) ? value.deps.length : 0)
    && normalizeStringList(value.resource).length === (Array.isArray(value.resource) ? value.resource.length : 0)
    && normalizeStringList(value.preset).length === (Array.isArray(value.preset) ? value.preset.length : 0)
    && value.cache !== undefined
    && value.isolation !== undefined
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

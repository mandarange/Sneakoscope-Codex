import { nowIso } from '../fsx.js'

export const SSOT_GUARD_SCHEMA = 'sks.ssot-guard.v1'
export const SSOT_GUARD_ARTIFACT = 'ssot-guard.json'

export interface SsotGuardSource {
  id: string
  source: string
  authority: string
  derived: string[]
  rule: string
}

export interface SsotGuardReport {
  schema: string
  ok: boolean
  required: boolean
  generated_at: string
  route: string | null
  mode: string | null
  contract_hash: string | null
  task_present: boolean
  canonical_sources: SsotGuardSource[]
  solid_principles: Array<{ id: string; principle: string; gate_expectation: string }>
  solid_risk_flags: string[]
  forbidden_patterns: string[]
  required_checks: string[]
  gate_rule: string
}

export function buildSsotGuard(input: { route?: string | null; mode?: string | null; task?: string | null; contractHash?: string | null } = {}): SsotGuardReport {
  return {
    schema: SSOT_GUARD_SCHEMA,
    ok: true,
    required: true,
    generated_at: nowIso(),
    route: input.route || null,
    mode: input.mode || null,
    contract_hash: input.contractHash || null,
    task_present: Boolean(String(input.task || '').trim()),
    canonical_sources: canonicalSsotSources(),
    solid_principles: solidPrinciples(),
    solid_risk_flags: [
      'god_object_or_god_module',
      'unbounded_conditional_routing_for_extension',
      'subtype_or_adapter_contract_narrowing',
      'fat_interface_for_small_callers',
      'direct_dependency_on_concrete_infrastructure_when_boundary_exists'
    ],
    forbidden_patterns: [
      'hand_edit_dist_or_generated_runtime_output',
      'duplicate_runtime_logic_outside_src_source',
      'use_coordinate_only_legacy_triwiki_pack_for_pipeline_decision',
      'implement_outside_sealed_route_contract',
      'invent_unrequested_fallback_behavior_when_requested_path_blocks',
      'copy_stack_api_syntax_without_current_docs_when_versions_change'
    ],
    required_checks: [
      'pipeline_plan_contains_ssot_guard_stage',
      'naruto_plan_requires_ssot_guard_artifact',
      'naruto_gate_requires_ssot_guard_true',
      'stop_gate_validates_ssot_guard_artifact',
      'release_dag_runs_ssot_guard',
      'release_dag_runs_architecture_guard',
      'release_manifest_marks_architecture_guard_p0_and_publish_required'
    ],
    gate_rule: `${SSOT_GUARD_ARTIFACT} must validate SSOT and SOLID expectations before a Naruto gate may set ssot_guard=true.`
  }
}

export function canonicalSsotSources(): SsotGuardSource[] {
  return [
    {
      id: 'route_contract',
      source: 'decision-contract.json, route prompt, and pipeline-plan.json',
      authority: 'The sealed user objective, constraints, non-goals, and acceptance criteria define what code may be created.',
      derived: ['subagent-plan.json', 'subagent-events.jsonl', 'worker inboxes'],
      rule: 'Do not implement behavior outside the sealed route contract; block with evidence if the requested path cannot be honored.'
    },
    {
      id: 'triwiki_context',
      source: '.sneakoscope/wiki/context-pack.json',
      authority: 'TriWiki is the bounded mission context SSOT and must be refreshed or packed, then validated before risky handoffs and final claims.',
      derived: ['subagent-parent-summary.json', 'subagent-evidence.json', 'reflection.md'],
      rule: 'Use the latest coordinate+voxel overlay pack; coordinate-only legacy packs are invalid for pipeline decisions.'
    },
    {
      id: 'runtime_source',
      source: 'src/**/*.ts',
      authority: 'TypeScript source is the runtime SSOT.',
      derived: ['dist/**', 'dist/bin/sks.js'],
      rule: 'Edit source, rebuild derived output, and rely on runtime:ts-source-of-truth plus runtime:dist-parity.'
    },
    {
      id: 'generated_outputs',
      source: 'source generators, build scripts, and schema definitions',
      authority: 'Generated files are derived from their generator or schema owner.',
      derived: ['release-gates.v2.json', 'infra-harness-gates.json', '.sneakoscope/reports/**', 'dist/build-manifest.json'],
      rule: 'Regenerate derived artifacts instead of hand-editing them as independent truth.'
    },
    {
      id: 'stack_current_docs',
      source: '.sneakoscope/memory/q2_facts/stack-current-docs.md',
      authority: 'Current vendor or Context7 docs override model-memory defaults when stack versions or APIs change.',
      derived: ['implementation notes', 'route evidence'],
      rule: 'Fetch and record current docs before relying on external package, SDK, API, MCP, or generated-doc behavior that may have changed.'
    },
    {
      id: 'release_gate_manifest',
      source: 'src/core/release/gate-manifest.ts and src/scripts/release-parallel-check.ts',
      authority: 'Release gate selection and publish-required status live in the manifest plus the release DAG.',
      derived: ['.sneakoscope/reports/release-gate-plan.json', '.sneakoscope/reports/gate-policy-audit.json'],
      rule: 'Publish-blocking guard gates must appear in the DAG, manifest, and package scripts.'
    }
  ]
}

export function ssotGuardPolicyText(commandPrefix = 'sks') {
  return `SSOT/SOLID guard: before creating or changing code, identify the authoritative source for the surface being edited, edit only that source, regenerate derived outputs, and reject duplicated or fallback behavior that would compete with the source of truth. Keep changes aligned to SOLID by preserving single responsibility, extension boundaries, substitutable adapters, narrow interfaces, and dependency inversion at existing seams. Naruto routes must write ${SSOT_GUARD_ARTIFACT}, set naruto-gate.json ssot_guard=true only after it validates, and run ${commandPrefix} wiki validate .sneakoscope/wiki/context-pack.json before final claims.`
}

export function validateSsotGuardArtifact(value: unknown): { ok: boolean; issues: string[] } {
  const issues: string[] = []
  if (!isRecord(value)) return { ok: false, issues: ['artifact_not_object'] }
  if (value.schema !== SSOT_GUARD_SCHEMA) issues.push('schema')
  if (value.ok !== true) issues.push('ok')
  if (value.required !== true) issues.push('required')
  const sources = Array.isArray(value.canonical_sources) ? value.canonical_sources : []
  if (!sources.length) issues.push('canonical_sources')
  const sourceIds = new Set(
    sources
      .filter(isRecord)
      .map((source) => typeof source.id === 'string' ? source.id : '')
      .filter(Boolean)
  )
  for (const id of ['route_contract', 'triwiki_context', 'runtime_source', 'generated_outputs', 'release_gate_manifest']) {
    if (!sourceIds.has(id)) issues.push(`canonical_sources:${id}`)
  }
  const forbidden = stringArray(value.forbidden_patterns)
  if (forbidden.length < 5) issues.push('forbidden_patterns')
  const solid = Array.isArray(value.solid_principles) ? value.solid_principles : []
  if (solid.length !== 5) issues.push('solid_principles')
  const solidIds = new Set(
    solid
      .filter(isRecord)
      .map((principle) => typeof principle.id === 'string' ? principle.id : '')
      .filter(Boolean)
  )
  for (const id of ['single_responsibility', 'open_closed', 'liskov_substitution', 'interface_segregation', 'dependency_inversion']) {
    if (!solidIds.has(id)) issues.push(`solid_principles:${id}`)
  }
  if (stringArray(value.solid_risk_flags).length < 5) issues.push('solid_risk_flags')
  const checks = stringArray(value.required_checks)
  for (const check of ['naruto_gate_requires_ssot_guard_true', 'stop_gate_validates_ssot_guard_artifact', 'release_dag_runs_ssot_guard', 'release_dag_runs_architecture_guard']) {
    if (!checks.includes(check)) issues.push(`required_checks:${check}`)
  }
  if (typeof value.gate_rule !== 'string' || !value.gate_rule.includes(SSOT_GUARD_ARTIFACT)) issues.push('gate_rule')
  return { ok: issues.length === 0, issues }
}

function solidPrinciples(): Array<{ id: string; principle: string; gate_expectation: string }> {
  return [
    {
      id: 'single_responsibility',
      principle: 'Single Responsibility Principle',
      gate_expectation: 'A pipeline or gate change should have one clear reason to change; split mixed release, routing, UI, DB, or publishing concerns before they become coupled.'
    },
    {
      id: 'open_closed',
      principle: 'Open/Closed Principle',
      gate_expectation: 'Prefer adding a new gate, manifest entry, strategy, or adapter over editing unrelated conditional paths for each new behavior.'
    },
    {
      id: 'liskov_substitution',
      principle: 'Liskov Substitution Principle',
      gate_expectation: 'Adapters, fallbacks, and fake/real backends must satisfy the same contract without weakening output, safety, or evidence guarantees.'
    },
    {
      id: 'interface_segregation',
      principle: 'Interface Segregation Principle',
      gate_expectation: 'Keep route, gate, and worker contracts narrow so callers do not depend on unused DB, browser, release, image, or native-session capabilities.'
    },
    {
      id: 'dependency_inversion',
      principle: 'Dependency Inversion Principle',
      gate_expectation: 'High-level route orchestration should depend on stable contracts and manifests, not concrete shell, npm, browser, or native-agent implementation details.'
    }
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

import { latestTierModelSet } from './model-tiers.js'
import { HARD_NARUTO_MAX_THREADS, type SubagentCapacityController } from './thread-budget.js'
import type { BoundedTriwikiAttention } from './triwiki-attention.js'
import { coreEngineeringDirectiveReferenceText } from '../lean-engineering-policy.js'
import {
  MAX_AUTOMATIC_REVIEWER_COUNT,
  MAX_AUTOMATIC_SUBAGENT_COUNT,
  MAX_CRITICAL_AUTOMATIC_REVIEWER_COUNT,
  officialSubagentOnDemandRoleCatalog,
  officialSubagentRoleCatalog,
  selectOfficialSubagentRole
} from './agent-catalog.js'
import type { RoleModelPreference } from './role-model-preferences.js'

export interface ActiveMainModelRouting {
  provider: string
  model: string
}

export type OfficialSubagentParentOutputMode = 'raw_json' | 'app_naruto_stdin'

export interface OfficialSubagentSlice {
  id: string
  title: string
  description: string
  kind: 'worker' | 'expert'
  agent?: string
  paths?: string[]
  readOnly?: boolean
}

export function buildOfficialSubagentPrompt(input: {
  goal: string
  slices: OfficialSubagentSlice[]
  maxThreads: number
  requestedSubagents?: number
  requestedSubagentsExplicit?: boolean
  requestedSubagentsSource?: 'operator' | 'route_contract' | 'automatic'
  decompositionStatus?: 'ready' | 'parent_required'
  firstWave?: number
  waveCount?: number
  capacity?: SubagentCapacityController
  triwikiAttention?: BoundedTriwikiAttention
  recommendedAgents?: readonly string[]
  roleModelPreferences?: Readonly<Record<string, RoleModelPreference>>
  routedAgents?: Readonly<Record<string, { routed_model?: string; routed_model_reasoning_effort?: string }>>
  narutoChildRouting?: boolean
  /** Jev mode is on: Jev picks every child tier, so the parent reads no model rules. */
  jevRouting?: boolean
  activeMainModel?: ActiveMainModelRouting | null
  parentOutputMode?: OfficialSubagentParentOutputMode
  missionId?: string
  workflowRunId?: string
  decisionContract?: {
    planId?: string | null
    workerCount?: number | null
    keepContextIds?: readonly string[] | null
    routingLane?: string | null
    executeSelectedIds?: boolean
  } | null
}): string {
  const maxThreads = clampThreads(input.maxThreads)
  const requestedSubagents = normalizeRequestedSubagents(input.requestedSubagents, input.slices.length)
  const firstWave = input.firstWave === undefined
    ? Math.min(requestedSubagents, maxThreads)
    : normalizeRequestedSubagents(input.firstWave, 0)
  const waveCount = input.waveCount === undefined
    ? firstWave > 0 ? Math.ceil(requestedSubagents / firstWave) : 0
    : normalizeRequestedSubagents(input.waveCount, 0)
  const parentDecompositionRequired = input.decompositionStatus === 'parent_required'
  const requestedSource = input.requestedSubagentsSource === 'route_contract'
    ? 'route_contract'
    : input.requestedSubagentsExplicit === true || input.requestedSubagentsSource === 'operator'
      ? 'operator'
      : 'automatic'
  const requestedPolicy = requestedSource === 'operator'
    ? `${requestedSubagents} (explicit operator request)`
    : requestedSource === 'route_contract'
      ? `${requestedSubagents} (route-owned exact orchestration contract)`
      : `${requestedSubagents} (dynamic automatic target; keep the final decomposed plan and evidence count exact)`
  const triwiki = renderBoundedTriwikiAttention(input.triwikiAttention)
  const decisionContract = renderDecisionContract(input.decisionContract)
  const resolvedSlices = input.slices.map((slice) => ({
    slice,
    agentName: slice.agent || selectOfficialSubagentRole({
      title: slice.title,
      description: slice.description,
      role: slice.kind,
      ...(slice.paths === undefined ? {} : { paths: slice.paths }),
      readOnly: slice.readOnly === true,
      requiresWrite: slice.readOnly !== true
    })
  }))
  const sliceSafety = validateOfficialSubagentSlices(resolvedSlices.map(({ slice, agentName }) => ({
    ...slice,
    agent: agentName
  })))
  const catalog = renderAgentCatalog([
    ...resolvedSlices.map((row) => row.agentName),
    ...(input.recommendedAgents || [])
  ])
  const activeMainModel = normalizedActiveMainModel(input.activeMainModel)
  // A stored role preference on a current tier model wins for that role.
  const currentModels = latestTierModelSet()
  const rolePreferences = Object.fromEntries(Object.entries(input.roleModelPreferences || {})
    .filter(([name, row]) => currentModels.has(row.model)
      && ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(row.reasoning_effort)
      && officialSubagentOnDemandRoleCatalog([name]).some((role) => role.name === name)))
  const effortPreferences = Object.fromEntries(Object.entries(rolePreferences).map(([name, row]) => [name, row.reasoning_effort]))
  const narutoChildren = input.narutoChildRouting === true
  const jevRouting = input.jevRouting === true
  const spawnModelRouting = renderSpawnModelRouting(narutoChildren, jevRouting)
  // Every child runs the newest model of the tier its work needs. With Jev on
  // the parent gets no tier rules to weigh: Jev decides each spawn.
  const tierRules = jevRouting
    ? []
    : [
        '- tiers: fast for tiny mechanical shards (search, rename, copy, label, one-line edits), balanced for instructed UI, logic, backend, and native implementation, context for long reads, exploration, large first drafts, Computer Use, browser, or image work, deep for planning, review, debugging, architecture, security, database, research, release, or other judgment',
        '- explicit task class and phase win over incidental keywords; a mixed slice takes the deeper tier; never apply the parent profile to every child'
      ]
  const childModelRules = narutoChildren
    ? [
        '- the parent orchestrates only: decompose the goal, assign disjoint slices, spawn children, and integrate their results',
        '- do not implement the assigned slice work in the parent thread',
        '- use the model and reasoning_effort named in each slice spawn contract; each is the newest model of its tier',
        ...tierRules,
        '- keep a stored user role-model preference for that role'
      ].join('\n')
    : tierRules.join('\n')
  const parentOutputMode = input.parentOutputMode === 'app_naruto_stdin'
    ? 'app_naruto_stdin'
    : 'raw_json'
  const rows = resolvedSlices.map(({ slice, agentName }, index) => {
    const mode = slice.readOnly ? 'read-only' : 'use the parent permission mode'
    const paths = (slice.paths || []).map((entry) => String(entry).trim()).filter(Boolean)
    const role = officialSubagentOnDemandRoleCatalog([agentName])[0]
    const routed = input.routedAgents?.[agentName]
    const sealedReasoning = routed?.routed_model_reasoning_effort
      || effortPreferences[agentName]
      || role?.model_reasoning_effort
      || 'medium'
    const sealedModel = routed?.routed_model || rolePreferences[agentName]?.model || role?.model
    const spawnContract = role
      ? `pass model=${JSON.stringify(sealedModel)} and reasoning_effort=${JSON.stringify(sealedReasoning)} from the sealed role policy`
      : 'stop before spawning: resolve an installed sealed role and its tier first'

    return [
      `${index + 1}. [${slice.id}] use custom agent \`${agentName}\``,
      `   ${slice.title}: ${slice.description}`,
      `   model: ${role ? `${role.model}/${sealedReasoning}` : 'resolve from installed custom agent'}`,
      `   spawn contract: ${spawnContract}`,
      `   mode: ${mode}; paths: ${paths.join(', ') || 'assigned by parent'}`
    ].join('\n')
  }).join('\n')

  return `
Outcome:
- Complete the goal; the parent owns decomposition, integration, verification, and the final answer.
- do not duplicate delegated work; finish and verify, or stop with blocked/failed evidence without claiming success
- Honor existing authorization. Avoid redundant checks; keep messages legible and concise.

${coreEngineeringDirectiveReferenceText()}

Goal:
${String(input.goal || '').trim()}

Slices:
${rows || '(parent decomposition required before any subagent is spawned)'}

Host capability policy:
- confirm requested tools in the project MCP inventory; if unavailable or unhealthy, return blocked proof and never fabricate a fallback
- DB: schema first. SQL-only may stop there; retrieval defaults to one bounded query and allows at most four total for separate aggregation or verification. Every query needs a prior schema receipt for the same datasource and matching snapshot
- spreadsheet: prefer the smallest create/edit mutation; allow at most three updates, inspect after create and every update, and require the final mutation artifact receipt
- document: write_file/edit_file then html_to_pdf|html_to_screenshot(source_path=...); never raw html
- Slack delivery is ACAS-runtime-only, never a model tool

Subagent rules:
- parent model policy: ${activeMainModel ? `keep the current app-selected main model ${activeMainModel.provider}:${activeMainModel.model}` : 'keep the user-selected parent model'}
- use only Codex official subagent threads; do not launch shell workers, a custom scheduler, a worker pool, or model fanout
- select the narrowest matching project custom agent by its description; the custom agent name is the spawn type
- custom \`agent_type\` selection and spawn-time \`model\`/\`reasoning_effort\` overrides must use \`fork_turns="none"\` or a positive bounded turn count, with the complete bounded slice contract in \`message\`; context contract: pass fork_turns="none" for listed slices
- \`spawn_agent\` has no provider argument; ${narutoChildren ? 'Naruto children use the tier model named in the spawn contract' : 'children use the sealed model slug'}
- never combine \`fork_turns="all"\` or the omitted/default full-history mode with \`agent_type\`, \`model\`, or \`reasoning_effort\`; Codex rejects that start before SubagentStart
- never use a full-history fork for SKS children
${spawnModelRouting}
${Object.keys(effortPreferences).length ? `- stored role effort preferences override role defaults, including later slices: ${JSON.stringify(effortPreferences)}` : ''}
${childModelRules}

Plan and capacity:
- automatic fan-out is capacity-derived up to ${MAX_AUTOMATIC_SUBAGENT_COUNT}: after decomposition, use every safe useful child slot supported by the ready DAG, disjoint ownership, verifier/tool capacity, and actual host limits; initial targets are 4/6/8 (16 for mass fast/context work) and may grow after decomposition
- automatic reviewer-only fan-out is capped at ${MAX_AUTOMATIC_REVIEWER_COUNT} for ordinary work and ${MAX_CRITICAL_AUTOMATIC_REVIEWER_COUNT} for critical multi-domain review
- requested subagents: ${requestedPolicy}
- max concurrently open child agent threads: ${maxThreads} (hard child-slot cap, never a utilization target; the root is outside this count)
- selected first-wave concurrency: ${firstWave}
- planned waves: ${waveCount}
- capacity snapshot: ${renderCapacity(input.capacity)}
- before every wave compute C_t = min(ready DAG width, disjoint ownership, verifier capacity, tool concurrency, available thread slots after reservations, marginal-useful workers); launch n_t <= C_t only while marginal useful throughput stays positive
- use the largest safe useful wave within C_t; max depth: 1 applies only to child nesting, so the root parent may launch later direct-child waves; subagents must not spawn subagents
- parallel writes require disjoint paths; serialize overlaps
- reject duplicate slice fingerprints and homogeneous clone work; diversity may come from roles, disjoint shards, or different tool surfaces
- security, database, release, authorization, and irreversible-effect checks are protected strata; aggregate speed or accuracy never offsets a failed protected gate
- after each SubagentStart/SubagentStop, update \`subagent-plan.json.wave_lifecycle\` under the same workflow_run_id
- after each settled wave: collect results, close completed threads, refresh evidence/ledger, follow \`next_parent_actions\` / \`parent_guidance\`, rescan the ready DAG, then launch the next defensible direct-child wave when \`remaining_to_start > 0\`; capacity is reusable
- when guidance says \`spawn_next_direct_child_wave_upto:N\`, immediately spawn that wave with sealed role profiles
- automatic targets may resize between waves when the ready DAG changes, but update plan/evidence before spawning; explicit operator and route-owned counts remain exact
- wait for every final planned subagent before integrating
- keep user updates sparse: report phase transitions, blockers, or decisions
${parentDecompositionRequired ? `- decomposition status: parent_required
- before spawning, decompose the goal into independent, non-overlapping slices
- do not invent write scopes merely to reach the requested count
${requestedSource === 'operator'
    ? '- the explicit operator count is authoritative; if it cannot be defended safely, block and report instead of silently changing it'
    : requestedSource === 'route_contract'
      ? '- the route-owned exact count is authoritative; preserve it and follow the route-specific orchestration contract'
      : `- after decomposition, resize the total automatic plan to the useful independent slice count, bounded only by the ${MAX_AUTOMATIC_SUBAGENT_COUNT} hard safety ceiling; C_t bounds each wave, not the reusable multi-wave total; update plan/evidence before the first spawn
- if fewer defensible slices exist, reduce the count; if more defensible slices and positive capacity exist, increase only within the automatic ceiling`}` : '- decomposition status: ready'}

Slice safety:
${renderSliceSafety(sliceSafety, parentDecompositionRequired)}

Central TriWiki context:
${triwiki}
${decisionContract}

Project custom agent catalog:
${catalog}

${parentOutputMode === 'app_naruto_stdin'
    ? renderAppNarutoParentOutput(input.missionId, input.workflowRunId)
    : renderRawJsonParentOutput()}
`.trim()
}

function renderRawJsonParentOutput(): string {
  return `Final parent output:
- return one JSON object as the final message; prose outside that object is not completion evidence; keep Completion Summary and Honest Mode in its summary
{
  "schema": "sks.subagent-parent-summary.v1",
  "run_id": "workflow_run_id from subagent-plan.json",
  "status": "completed|blocked|failed",
  "summary": "Completion Summary: concise integrated result. Honest Mode: goal/evidence/checks/gaps assessment.",
  "thread_outcomes": [{ "thread_id": "official agent/thread id", "status": "completed|blocked|failed", "summary": "slice result" }],
  "changed_files": [],
  "verification": [{ "name": "focused check", "status": "passed|not_applicable", "reason": "required when not_applicable" }],
  "artifacts": [{ "path": "relative/path", "kind": "kind", "media_type": "MIME", "sha256": "sha256:<64 hex>", "bytes": 1, "role": "deliverable|scratch|temp|log" }],
  "capabilities_used": [{ "id": "capability id", "status": "passed|failed", "tool_names": ["called tool"], "receipt_sha256": "sha256:<64 hex>" }],
  "blockers": []
}
- include one thread_outcomes row for every requested subagent; a SubagentStop event alone never proves success
- copy workflow_run_id from subagent-plan.json into run_id to reject stale summaries
- if changed_files is non-empty, include at least one passed named check or a specifically justified not_applicable verification row
- use empty artifacts/capabilities_used arrays when no host capability was used; SKS overwrites these fields with observed Codex JSONL evidence before persistence
`
}

function renderAppNarutoParentOutput(missionId: unknown, workflowRunId: unknown): string {
  const mission = String(missionId || '').trim()
  const runId = String(workflowRunId || '').trim()
  return `Final parent output for this active Codex App Naruto run:
- build one exact JSON object using the strict sks.subagent-parent-summary.v1 schema below, with run_id=${JSON.stringify(runId || 'workflow_run_id from subagent-plan.json')}
- send that object only through stdin to \`sks naruto parent-summary --mission ${mission || '<mission-id>'} --stdin --json\`; this command is the sole parent-summary commit path
- do not expose, paste, quote, embed, or fence the JSON in the user-visible response
- only after the command accepts the object, return concise Markdown in the user's language with completion summary, verification, remaining gaps/blockers, and Honest Mode
- if the parent status, any thread outcome, or any blocker is blocked/failed, state the blocker or failure first and do not use completion or success wording
- a successful visible response must contain an explicit completion summary and Honest Mode assessment; hard-blocked/failed responses state the blocker first instead
- use this exact object schema for the stdin submission:
{
  "schema": "sks.subagent-parent-summary.v1",
  "run_id": "workflow_run_id from subagent-plan.json",
  "status": "completed|blocked|failed",
  "summary": "Concise integrated result and Honest Mode assessment.",
  "thread_outcomes": [
    { "thread_id": "official agent/thread id", "status": "completed|blocked|failed", "summary": "slice result" }
  ],
  "changed_files": [],
  "verification": [
    { "name": "focused check", "status": "passed|not_applicable", "reason": "required when not_applicable" }
  ],
  "artifacts": [],
  "capabilities_used": [],
  "blockers": []
}
- include one thread_outcomes row for every requested subagent; a SubagentStop event alone never proves success
- copy workflow_run_id from subagent-plan.json into run_id exactly so delayed or stale summaries cannot bind to another run
- if changed_files is non-empty, include at least one passed named check or a specifically justified not_applicable verification row
- use empty artifacts/capabilities_used arrays when no host capability was used; SKS replaces these fields with observed Codex JSONL evidence before canonical persistence
`
}

function normalizedActiveMainModel(value: ActiveMainModelRouting | null | undefined): ActiveMainModelRouting | null {
  const provider = String(value?.provider || '').trim()
  const model = String(value?.model || '').trim()
  return provider && model ? { provider, model } : null
}

function renderSpawnModelRouting(narutoChildRouting: boolean, jevRouting: boolean): string {
  const lines = jevRouting
    ? [
        '- Jev mode: Jev picks each child tier (fast, balanced, context, or deep) and the SKS PreToolUse hook seals that tier\'s newest model on every spawn_agent call; pass the contract model unchanged and spend no time choosing models or efforts'
      ]
    : [
        `- model routing applies to every child, including slices created after parent decomposition: the newest model of the role tier${narutoChildRouting ? ' named in the spawn contract' : ''}`
      ]
  return [
    ...lines,
    '- parent selection never overrides the child model; stored user role preferences stay authoritative',
    '- preserve the user-selected parent model, reasoning effort, and service tier'
  ].join('\n')
}

export interface OfficialSubagentSliceSafety {
  safe: boolean
  blockers: string[]
  duplicate_slice_ids: string[][]
  overlapping_write_scopes: Array<{ left: string; right: string; path: string }>
  unassigned_write_scopes: string[]
  distinct_role_count: number
}

export function validateOfficialSubagentSlices(slices: readonly OfficialSubagentSlice[]): OfficialSubagentSliceSafety {
  const blockers: string[] = []
  const duplicateSliceIds: string[][] = []
  const overlappingWriteScopes: Array<{ left: string; right: string; path: string }> = []
  const unassignedWriteScopes: string[] = []
  const fingerprints = new Map<string, string[]>()

  for (const slice of slices) {
    const id = String(slice.id || '').trim() || 'unnamed'
    const paths = normalizedPaths(slice.paths)
    const fingerprint = [
      normalizedIntent(slice.title),
      normalizedIntent(slice.description),
      String(slice.agent || slice.kind || '').trim().toLowerCase(),
      paths.join('|'),
      slice.readOnly === true ? 'read-only' : 'write'
    ].join('::')
    const ids = fingerprints.get(fingerprint) || []
    ids.push(id)
    fingerprints.set(fingerprint, ids)
    if (slice.readOnly !== true && paths.length === 0) unassignedWriteScopes.push(id)
  }

  for (const ids of fingerprints.values()) {
    if (ids.length < 2) continue
    duplicateSliceIds.push(ids)
    blockers.push(`duplicate_slice_fingerprint:${ids.join(',')}`)
  }

  const writable = slices
    .filter((slice) => slice.readOnly !== true)
    .map((slice) => ({ id: String(slice.id || '').trim() || 'unnamed', paths: normalizedPaths(slice.paths) }))
  for (let leftIndex = 0; leftIndex < writable.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < writable.length; rightIndex += 1) {
      const left = writable[leftIndex]!
      const right = writable[rightIndex]!
      const overlap = firstOverlappingPath(left.paths, right.paths)
      if (!overlap) continue
      overlappingWriteScopes.push({ left: left.id, right: right.id, path: overlap })
      blockers.push(`overlapping_write_scope:${left.id}:${right.id}:${overlap}`)
    }
  }
  if (writable.length > 1) {
    for (const id of unassignedWriteScopes) blockers.push(`unassigned_parallel_write_scope:${id}`)
  }

  return {
    safe: blockers.length === 0,
    blockers: [...new Set(blockers)],
    duplicate_slice_ids: duplicateSliceIds,
    overlapping_write_scopes: overlappingWriteScopes,
    unassigned_write_scopes: unassignedWriteScopes,
    distinct_role_count: new Set(slices.map((slice) => String(slice.agent || slice.kind || '').trim()).filter(Boolean)).size
  }
}

function renderBoundedTriwikiAttention(value: BoundedTriwikiAttention | undefined): string {
  if (!value?.available || value.anchors.length === 0) {
    return [
      '- no bounded attention anchors are available; rely on current scoped sources',
      '- do not compensate by making every subagent reread the entire repository or full TriWiki pack'
    ].join('\n')
  }
  const anchors = value.anchors.map((anchor) => ({
    id: anchor.id,
    claim_hash: anchor.claim_hash,
    source_hash: anchor.source_hash,
    hydrate_hint: anchor.hydrate_hint,
    ...(anchor.source_path ? { source_path: anchor.source_path } : {}),
    ...(anchor.excerpt ? { excerpt: anchor.excerpt } : {})
  }))
  const hasExcerpt = value.anchors.some((anchor) => Boolean(anchor.excerpt))
  return [
    `- consume these ${anchors.length} attention.use_first anchors before broad discovery`,
    '- hydrate a referenced source only when its anchor is relevant to the assigned slice or a risky decision',
    '- do not inject the full context pack or make each subagent repeat repository-wide context discovery',
    ...(hasExcerpt
      ? ['- keep exact source text and provenance; do not summarize selected excerpts with another model']
      : []),
    `- bounded anchors: ${JSON.stringify(anchors)}`
  ].join('\n')
}

function renderDecisionContract(value: {
  planId?: string | null
  workerCount?: number | null
  keepContextIds?: readonly string[] | null
  routingLane?: string | null
  executeSelectedIds?: boolean
} | null | undefined): string {
  if (!value || value.executeSelectedIds !== true) return ''
  return [
    'Selected decision contract:',
    `- execute the selected plan${value.planId ? ` ${value.planId}` : ''} and retained optional context IDs; do not choose them again`,
    value.workerCount ? `- Jev fixed the automatic child target at ${value.workerCount}; do not recompute it (real host capacity still caps each wave)` : '',
    value.routingLane ? `- Jev sealed models: ${value.routingLane}` : '',
    value.keepContextIds?.length
      ? `- retained optional context IDs: ${value.keepContextIds.join(', ')}`
      : '- pinned and retained context already unioned by code'
  ].filter(Boolean).join('\n')
}

function renderAgentCatalog(requested: readonly string[]): string {
  const names = [...new Set(requested.map(String).map((name) => name.trim()).filter(Boolean))]
  const selected = officialSubagentOnDemandRoleCatalog(names.length ? names : ['expert'])
  const preferred = new Set(names)
  return [
    `- metadata mode: on-demand (${selected.length}/${officialSubagentRoleCatalog().length} roles included; full catalog is not injected)`,
    ...selected.map((role) => {
      const marker = preferred.has(role.name) ? ' [suggested for this goal]' : ''
      return `- \`${role.name}\`${marker}: ${role.model}/${role.model_reasoning_effort}, ${role.sandbox_mode}; ${role.description}`
    })
  ].join('\n')
}

function renderCapacity(capacity: SubagentCapacityController | undefined): string {
  if (!capacity) return 'parent recomputes after decomposition; no pre-decomposition capacity snapshot available'
  return JSON.stringify({
    formula: capacity.formula,
    selected_capacity: capacity.selected_capacity,
    available_thread_slots: capacity.available_thread_slots,
    limiting_factors: capacity.limiting_factors,
    reservations: capacity.reservations,
    marginal_useful_throughput_positive: capacity.marginal_useful_throughput_positive
  })
}

function renderSliceSafety(value: OfficialSubagentSliceSafety, parentDecompositionRequired: boolean): string {
  if (parentDecompositionRequired) {
    return [
      '- pending parent decomposition; validate duplicate fingerprints, write-scope overlap, ownership assignment, and role/shard/tool diversity before spawning',
      '- unsafe decomposition must be merged, serialized, or blocked before any child starts'
    ].join('\n')
  }
  if (value.safe) {
    return `- validated safe: ${value.distinct_role_count} distinct role(s), no duplicate slice fingerprint, and no overlapping write scope`
  }
  return `- blocked: ${value.blockers.join(', ')}`
}

function normalizedIntent(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizedPaths(paths: readonly string[] | undefined): string[] {
  return [...new Set((paths || [])
    .map((entry) => String(entry || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(Boolean))]
    .sort()
}

function firstOverlappingPath(leftPaths: readonly string[], rightPaths: readonly string[]): string | null {
  for (const left of leftPaths) {
    for (const right of rightPaths) {
      const leftPrefix = pathPrefix(left)
      const rightPrefix = pathPrefix(right)
      if (leftPrefix === '.'
        || rightPrefix === '.'
        || leftPrefix === rightPrefix
        || leftPrefix.startsWith(`${rightPrefix}/`)
        || rightPrefix.startsWith(`${leftPrefix}/`)) {
        return left.length <= right.length ? left : right
      }
    }
  }
  return null
}

function pathPrefix(value: string): string {
  const wildcard = value.search(/[?*[{]/)
  const prefix = wildcard >= 0 ? value.slice(0, wildcard) : value
  return prefix.replace(/\/+$/, '') || '.'
}

function clampThreads(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(HARD_NARUTO_MAX_THREADS, Math.floor(parsed)))
}

function normalizeRequestedSubagents(value: unknown, fallback: number): number {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value)
  if (!Number.isFinite(parsed)) return Math.max(0, Math.min(HARD_NARUTO_MAX_THREADS, fallback))
  return Math.max(0, Math.min(HARD_NARUTO_MAX_THREADS, Math.floor(parsed)))
}

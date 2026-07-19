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
  const rows = resolvedSlices.map(({ slice, agentName }, index) => {
    const mode = slice.readOnly ? 'read-only' : 'use the parent permission mode'
    const paths = (slice.paths || []).map((entry) => String(entry).trim()).filter(Boolean)
    const role = officialSubagentOnDemandRoleCatalog([agentName])[0]

    return [
      `${index + 1}. [${slice.id}] use custom agent \`${agentName}\``,
      `   title: ${slice.title}`,
      `   task: ${slice.description}`,
      `   model policy: ${role ? `${role.model_policy} (${role.model}/${role.model_reasoning_effort})` : 'resolve from installed custom agent'}`,
      `   mode: ${mode}`,
      `   paths: ${paths.join(', ') || 'assigned by parent'}`
    ].join('\n')
  }).join('\n')

  return `
Use a Codex subagent workflow for the independent slices below.

${coreEngineeringDirectiveReferenceText()}

Parent agent:
- model policy: gpt-5.6-sol with max reasoning
- owns decomposition, integration, and final answer
- do not do duplicate work already delegated

Subagent rules:
- use only Codex official subagent threads; do not launch shell workers, a custom scheduler, a worker pool, or model fanout
- select the narrowest matching project custom agent by its description; the custom agent name is the spawn type
- use \`worker\` with gpt-5.6-luna and max reasoning only for tiny, short-context, mechanical work with no exploration or judgment
- use gpt-5.6-sol with high reasoning for ordinary UI, logic, backend, and native implementation
- use gpt-5.6-sol with max reasoning only for focused unresolved, high-risk, final-review, architecture, security, database, research, release, or other explicit judgment slices
- use gpt-5.6-terra with medium reasoning for read-heavy documentation/exploration, long-context analysis, and direct Computer Use, Browser/Chrome, or image-generation execution
- explicit task class and phase win over incidental keywords: Terra gathers/explores, Sol High implements, and Sol Max performs the focused judgment pass
- never assign Luna to long-context, exploration, review, debugging, planning, or tool-heavy work
- automatic fan-out starts at two for bounded non-trivial work, four for explicit parallel work, and six for large-scale work; it may expand only up to ${MAX_AUTOMATIC_SUBAGENT_COUNT} when decomposition proves more independent useful slices
- automatic reviewer-only fan-out is capped at ${MAX_AUTOMATIC_REVIEWER_COUNT} for ordinary work and ${MAX_CRITICAL_AUTOMATIC_REVIEWER_COUNT} for critical multi-domain review
- requested subagents: ${requestedPolicy}
- max open agent threads: ${maxThreads} (hard cap, never a utilization target)
- selected first-wave concurrency: ${firstWave}
- planned waves: ${waveCount}
- wave lifecycle authority: root parent updates \`subagent-plan.json.wave_lifecycle\` under the same workflow_run_id after every SubagentStart/SubagentStop
- before every wave compute C_t = min(ready DAG width, disjoint ownership, verifier capacity, tool concurrency, available thread slots after reservations, marginal-useful workers); launch n_t <= C_t only while marginal useful throughput stays positive
- capacity snapshot: ${renderCapacity(input.capacity)}
- max depth: 1 applies only to child nesting; the root parent may and should launch later direct-child waves after earlier children settle
- subagents must not spawn subagents
- parallel writes require disjoint paths
- if paths overlap, run those slices serially
- reject duplicate slice fingerprints and homogeneous clone work; diversity may come from roles, disjoint shards, or different tool surfaces
- security, database, release, authorization, and irreversible-effect checks are protected strata; aggregate speed or accuracy never offsets a failed protected gate
- after each settled wave: collect results, close completed threads, refresh evidence and the wave lifecycle ledger, read \`wave_lifecycle.next_parent_actions\` / \`parent_guidance\`, rescan the ready DAG, then launch the next defensible direct-child wave when \`remaining_to_start > 0\`
- recovered thread capacity is reusable by later root-owned waves; completed child threads do not permanently consume the mission fan-out budget
- when PreTool/UserPrompt guidance says \`spawn_next_direct_child_wave_upto:N\`, spawn that next wave immediately with sealed custom-agent model/effort profiles; do not wait for another user message
- automatic targets may resize between waves when the ready DAG changes, but update plan/evidence before spawning; explicit operator and route-owned counts remain exact
- wait for every final planned subagent before integrating
- close completed threads after collecting results so capacity returns to the root parent
${parentDecompositionRequired ? `- decomposition status: parent_required
- before spawning, decompose the goal into independent, non-overlapping slices
- do not invent write scopes merely to reach the requested count
${requestedSource === 'operator'
    ? '- the explicit operator count is authoritative; if it cannot be defended safely, block and report instead of silently changing it'
    : requestedSource === 'route_contract'
      ? '- the route-owned exact count is authoritative; preserve it and follow the route-specific orchestration contract'
      : `- after decomposition, resize the automatic plan to the useful independent slice count, bounded by C_t and ${MAX_AUTOMATIC_SUBAGENT_COUNT}; update plan/evidence before the first spawn
- if fewer defensible slices exist, reduce the count; if more defensible slices and positive capacity exist, increase only within the automatic ceiling`}` : '- decomposition status: ready'}

Slice safety:
${renderSliceSafety(sliceSafety, parentDecompositionRequired)}

Central TriWiki context:
${triwiki}

Project custom agent catalog:
${catalog}

Goal:
${String(input.goal || '').trim()}

Slices:
${rows || '(parent decomposition required before any subagent is spawned)'}

Final parent output:
- return one JSON object as the final message; prose outside that object is not completion evidence
- use this exact schema so SKS can correlate every stopped agent thread with a trustworthy parent outcome:
{
  "schema": "sks.subagent-parent-summary.v1",
  "status": "completed|blocked|failed",
  "summary": "Completion Summary: concise integrated result. Honest Mode: goal/evidence/checks/gaps assessment.",
  "thread_outcomes": [
    { "thread_id": "official agent/thread id", "status": "completed|blocked|failed", "summary": "slice result" }
  ],
  "changed_files": [],
  "verification": [
    { "name": "focused check", "status": "passed|not_applicable", "reason": "required when not_applicable" }
  ],
  "blockers": []
}
- include one thread_outcomes row for every requested subagent; a SubagentStop event alone never proves success
- if changed_files is non-empty, include at least one passed named check or a specifically justified not_applicable verification row
- keep completion summary and Honest Mode wording inside the JSON fields; do not add prose outside the object
`.trim()
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
    hydrate_hint: anchor.hydrate_hint
  }))
  return [
    `- consume these ${anchors.length} attention.use_first anchors before broad discovery`,
    '- hydrate a referenced source only when its anchor is relevant to the assigned slice or a risky decision',
    '- do not inject the full context pack or make each subagent repeat repository-wide context discovery',
    `- bounded anchors: ${JSON.stringify(anchors)}`
  ].join('\n')
}

function renderAgentCatalog(requested: readonly string[]): string {
  const names = [...new Set(requested.map(String).map((name) => name.trim()).filter(Boolean))]
  const selected = officialSubagentOnDemandRoleCatalog(names.length ? names : ['expert'])
  const preferred = new Set(names)
  return [
    `- metadata mode: on-demand (${selected.length}/${officialSubagentRoleCatalog().length} roles included; full catalog is not injected)`,
    ...selected.map((role) => {
      const marker = preferred.has(role.name) ? ' [suggested for this goal]' : ''
      return `- \`${role.name}\`${marker}: ${role.model_policy}, ${role.model}/${role.model_reasoning_effort}, ${role.sandbox_mode}; ${role.description}`
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

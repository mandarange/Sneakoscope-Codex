import { HARD_NARUTO_MAX_THREADS } from './thread-budget.js'
import type { BoundedTriwikiAttention } from './triwiki-attention.js'
import {
  MAX_AUTOMATIC_REVIEWER_COUNT,
  MAX_AUTOMATIC_SUBAGENT_COUNT,
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
  triwikiAttention?: BoundedTriwikiAttention
  recommendedAgents?: readonly string[]
}): string {
  const maxThreads = clampThreads(input.maxThreads)
  const requestedSubagents = normalizeRequestedSubagents(input.requestedSubagents, input.slices.length)
  const waveCount = requestedSubagents === 0 ? 0 : Math.ceil(requestedSubagents / maxThreads)
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
      : `${requestedSubagents} (risk-based automatic count; two independent children are the non-trivial default; keep the plan and evidence count exact)`
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
  const catalog = renderAgentCatalog([
    ...resolvedSlices.map((row) => row.agentName),
    ...(input.recommendedAgents || [])
  ])
  const rows = resolvedSlices.map(({ slice, agentName }, index) => {
    const mode = slice.readOnly ? 'read-only' : 'use the parent permission mode'
    const paths = (slice.paths || []).map((entry) => String(entry).trim()).filter(Boolean)

    return [
      `${index + 1}. [${slice.id}] use custom agent \`${agentName}\``,
      `   title: ${slice.title}`,
      `   task: ${slice.description}`,
      `   mode: ${mode}`,
      `   paths: ${paths.join(', ') || 'assigned by parent'}`
    ].join('\n')
  }).join('\n')

  return `
Use a Codex subagent workflow for the independent slices below.

Parent agent:
- model policy: gpt-5.6-sol with max reasoning
- owns decomposition, integration, and final answer
- do not do duplicate work already delegated

Subagent rules:
- use only Codex official subagent threads; do not launch shell workers, a custom scheduler, a worker pool, or model fanout
- select the narrowest matching project custom agent by its description; the custom agent name is the spawn type
- use \`worker\` with gpt-5.6-luna and max reasoning only for clear, bounded, repeatable work
- use \`expert\` with gpt-5.6-sol and max reasoning only as the read-only judgment fallback
- automatic fan-out is selected before execution: two independent children for non-trivial work,
  and at most ${MAX_AUTOMATIC_SUBAGENT_COUNT} only for critical multi-domain risk; trivial Answer/DFix work is filtered before this route
- automatic reviewer-only fan-out is capped at ${MAX_AUTOMATIC_REVIEWER_COUNT} for ordinary work; critical multi-domain review may use the overall cap of ${MAX_AUTOMATIC_SUBAGENT_COUNT}
- requested subagents: ${requestedPolicy}
- max open agent threads: ${maxThreads}
- planned waves: ${waveCount}
- max depth: 1
- subagents must not spawn subagents
- parallel writes require disjoint paths
- if paths overlap, run those slices serially
- wait for every requested subagent before integrating
- close completed threads after collecting results
${parentDecompositionRequired ? `- decomposition status: parent_required
- before spawning, decompose the goal into independent, non-overlapping slices
- do not invent write scopes merely to reach the requested count
${requestedSource === 'operator'
    ? '- the explicit operator count is authoritative; if it cannot be defended safely, block and report instead of silently changing it'
    : requestedSource === 'route_contract'
      ? '- the route-owned exact count is authoritative; preserve it and follow the route-specific orchestration contract'
      : '- if fewer defensible slices exist, reduce the delegation plan and requested count before execution; never increase automatically beyond the selected count'}` : '- decomposition status: ready'}

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
  "verification": [],
  "blockers": []
}
- include one thread_outcomes row for every requested subagent; a SubagentStop event alone never proves success
- keep completion summary and Honest Mode wording inside the JSON fields; do not add prose outside the object
`.trim()
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
      return `- \`${role.name}\`${marker}: ${role.model}/${role.model_reasoning_effort}, ${role.sandbox_mode}; ${role.description}`
    })
  ].join('\n')
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

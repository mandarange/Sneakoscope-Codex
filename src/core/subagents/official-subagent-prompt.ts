import { HARD_NARUTO_MAX_THREADS } from './thread-budget.js'
import type { BoundedTriwikiAttention } from './triwiki-attention.js'

export interface OfficialSubagentSlice {
  id: string
  title: string
  description: string
  kind: 'worker' | 'expert'
  paths?: string[]
  readOnly?: boolean
}

export function buildOfficialSubagentPrompt(input: {
  goal: string
  slices: OfficialSubagentSlice[]
  maxThreads: number
  requestedSubagents?: number
  requestedSubagentsExplicit?: boolean
  decompositionStatus?: 'ready' | 'parent_required'
  triwikiAttention?: BoundedTriwikiAttention
}): string {
  const maxThreads = clampThreads(input.maxThreads)
  const requestedSubagents = normalizeRequestedSubagents(input.requestedSubagents, input.slices.length)
  const waveCount = requestedSubagents === 0 ? 0 : Math.ceil(requestedSubagents / maxThreads)
  const parentDecompositionRequired = input.decompositionStatus === 'parent_required'
  const requestedPolicy = input.requestedSubagentsExplicit === true
    ? `${requestedSubagents} (explicit operator request)`
    : `${requestedSubagents} (safe default; increase only after parent-owned decomposition finds defensible independent slices)`
  const triwiki = renderBoundedTriwikiAttention(input.triwikiAttention)
  const rows = input.slices.map((slice, index) => {
    const agentName = slice.kind === 'expert' ? 'expert' : 'worker'
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
- use \`worker\` (gpt-5.6-luna, max reasoning) for clear, bounded, repeatable work
- use \`expert\` (gpt-5.6-sol, max reasoning) for UI, review, debugging, strategy, planning,
  architecture, refactoring, integration, security, database, release, risk, or ambiguity
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
- if the defensible independent slice count differs, update the delegation plan and requested count before execution` : '- decomposition status: ready'}

Central TriWiki context:
${triwiki}

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

import { HARD_NARUTO_MAX_THREADS } from './thread-budget.js'

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
  decompositionStatus?: 'ready' | 'parent_required'
}): string {
  const maxThreads = clampThreads(input.maxThreads)
  const requestedSubagents = normalizeRequestedSubagents(input.requestedSubagents, input.slices.length)
  const waveCount = requestedSubagents === 0 ? 0 : Math.ceil(requestedSubagents / maxThreads)
  const parentDecompositionRequired = input.decompositionStatus === 'parent_required'
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
- use \`worker\` (gpt-5.6-luna, max reasoning) for clear, bounded, repeatable work
- use \`expert\` (gpt-5.6-sol, max reasoning) for UI, review, debugging, strategy, planning,
  architecture, refactoring, integration, security, database, release, risk, or ambiguity
- requested subagents: ${requestedSubagents}
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
  "summary": "concise integrated result",
  "thread_outcomes": [
    { "thread_id": "official agent/thread id", "status": "completed|blocked|failed", "summary": "slice result" }
  ],
  "changed_files": [],
  "verification": [],
  "blockers": []
}
- include one thread_outcomes row for every requested subagent; a SubagentStop event alone never proves success
`.trim()
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

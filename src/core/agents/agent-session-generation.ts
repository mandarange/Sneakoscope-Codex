import path from 'node:path'
import { ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const AGENT_SESSION_GENERATION_SCHEMA = 'sks.agent-session-generation.v1'
export const AGENT_SESSION_GENERATIONS_SCHEMA = 'sks.agent-session-generations.v1'

export interface AgentSessionGeneration {
  schema: typeof AGENT_SESSION_GENERATION_SCHEMA
  session_id: string
  slot_id: string
  generation_index: number
  task_id: string
  persona_id: string
  terminal_session_id: string
  started_at: string
  closed_at: string | null
  status: 'running' | 'closed' | 'failed' | 'blocked'
  result_artifact_path: string | null
  terminal_close_report_path: string | null
  artifact_dir: string
  source_intelligence_refs: Record<string, unknown> | null
  goal_mode_ref: Record<string, unknown> | null
  immutable_after_close: boolean
}

const GENERATION_LOCKS = new Map<string, Promise<unknown>>()

async function withGenerationLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const previous = GENERATION_LOCKS.get(root) || Promise.resolve()
  const next = previous.catch(() => undefined).then(fn)
  GENERATION_LOCKS.set(root, next.catch(() => undefined))
  return next
}

export function sessionGenerationId(input: { slotId: string; generationIndex: number; missionId: string; rootHash: string }) {
  return `agent_${input.slotId}-gen_${input.generationIndex}-${input.missionId}-${String(input.rootHash || 'root').slice(0, 12)}`
}

export function sessionGenerationDir(slotId: string, generationIndex: number) {
  return path.join('sessions', slotId, `gen-${generationIndex}`)
}

export function createAgentSessionGeneration(input: {
  slotId: string
  generationIndex: number
  missionId: string
  rootHash: string
  taskId: string
  personaId: string
  sourceIntelligenceRefs?: Record<string, unknown> | null
  goalModeRef?: Record<string, unknown> | null
}): AgentSessionGeneration {
  const artifactDir = sessionGenerationDir(input.slotId, input.generationIndex)
  const sessionId = sessionGenerationId(input)
  return {
    schema: AGENT_SESSION_GENERATION_SCHEMA,
    session_id: sessionId,
    slot_id: input.slotId,
    generation_index: input.generationIndex,
    task_id: input.taskId,
    persona_id: input.personaId,
    terminal_session_id: `${sessionId}-terminal`,
    started_at: nowIso(),
    closed_at: null,
    status: 'running',
    result_artifact_path: null,
    terminal_close_report_path: null,
    artifact_dir: artifactDir,
    source_intelligence_refs: input.sourceIntelligenceRefs || null,
    goal_mode_ref: input.goalModeRef || null,
    immutable_after_close: true
  }
}

export async function writeAgentSessionGeneration(root: string, generation: AgentSessionGeneration) {
  return withGenerationLock(root, async () => {
    const aggregate = await readAgentSessionGenerations(root)
    aggregate.generations[generation.session_id] = {
      ...(aggregate.generations[generation.session_id] || {}),
      ...generation
    }
    aggregate.generation_count = Object.keys(aggregate.generations).length
    aggregate.updated_at = nowIso()
    await writeGenerationFiles(root, aggregate.generations[generation.session_id])
    await writeJsonAtomic(path.join(root, 'agent-session-generations.json'), aggregate)
    return aggregate.generations[generation.session_id]
  })
}

export async function closeAgentSessionGeneration(root: string, sessionId: string, patch: {
  status?: 'closed' | 'failed' | 'blocked'
  resultArtifactPath?: string | null
  terminalCloseReportPath?: string | null
} = {}) {
  return withGenerationLock(root, async () => {
    const aggregate = await readAgentSessionGenerations(root)
    const current = aggregate.generations[sessionId]
    if (!current) return null
    if (current.closed_at) return current
    const closed: AgentSessionGeneration = {
      ...current,
      status: patch.status || 'closed',
      closed_at: nowIso(),
      result_artifact_path: patch.resultArtifactPath ?? current.result_artifact_path,
      terminal_close_report_path: patch.terminalCloseReportPath ?? current.terminal_close_report_path
    }
    aggregate.generations[sessionId] = closed
    aggregate.generation_count = Object.keys(aggregate.generations).length
    aggregate.updated_at = nowIso()
    await writeGenerationFiles(root, closed)
    await writeJsonAtomic(path.join(root, 'agent-session-generations.json'), aggregate)
    return closed
  })
}

export async function readAgentSessionGenerations(root: string) {
  return readJson<any>(path.join(root, 'agent-session-generations.json'), {
    schema: AGENT_SESSION_GENERATIONS_SCHEMA,
    updated_at: nowIso(),
    generation_count: 0,
    generations: {}
  })
}

export async function assertAgentSessionGenerationsClosed(root: string) {
  const aggregate = await readAgentSessionGenerations(root)
  const rows = Object.values<AgentSessionGeneration>(aggregate.generations || {})
  const open = rows.filter((row) => !row.closed_at || !['closed', 'failed', 'blocked'].includes(row.status))
  const missingSource = rows.filter((row) => !row.source_intelligence_refs)
  const missingGoal = rows.filter((row) => !row.goal_mode_ref)
  return {
    schema: 'sks.agent-session-generation-closure.v1',
    ok: rows.length > 0 && open.length === 0 && missingSource.length === 0 && missingGoal.length === 0,
    generation_count: rows.length,
    closed_generation_count: rows.filter((row) => Boolean(row.closed_at)).length,
    open_generations: open.map((row) => row.session_id),
    missing_source_intelligence_refs: missingSource.map((row) => row.session_id),
    missing_goal_mode_refs: missingGoal.map((row) => row.session_id),
    blockers: [
      ...open.map((row) => `session_generation_open:${row.session_id}`),
      ...missingSource.map((row) => `source_intelligence_missing_for_generation:${row.session_id}`),
      ...missingGoal.map((row) => `goal_mode_missing_for_generation:${row.session_id}`)
    ]
  }
}

async function writeGenerationFiles(root: string, generation: AgentSessionGeneration) {
  await ensureDir(path.join(root, generation.artifact_dir))
  await writeJsonAtomic(path.join(root, generation.artifact_dir, 'agent-session-generation.json'), generation)
}

import path from 'node:path'
import { appendJsonlBounded, nowIso, writeJsonAtomic } from '../fsx.js'
import { runResearchStage, type ResearchStageBackend, type ResearchStageResult } from './research-stage-runner.js'

export interface ResearchCycleInput {
  root: string
  dir: string
  plan: any
  graph: any
  cycle: number
  backend: ResearchStageBackend
  timeoutMs: number
  maxParallelStages?: number
  maxReviewCycles?: number
  maxReviewThreads?: number
  mock?: boolean
}

export async function runResearchCycle(inputOrDir: ResearchCycleInput | string, legacyGraph: any = null, legacyOpts: any = {}) {
  const input: ResearchCycleInput = typeof inputOrDir === 'string'
    ? {
        root: process.cwd(),
        dir: inputOrDir,
        plan: null,
        graph: legacyGraph,
        cycle: Number(legacyOpts.cycle || 0),
        backend: legacyOpts.mock ? 'mock' : 'deterministic',
        timeoutMs: Number(legacyOpts.timeoutMs || 120000),
        maxParallelStages: Number(legacyOpts.maxParallelStages || legacyOpts.maxParallel || 4),
        mock: legacyOpts.mock === true
      }
    : inputOrDir
  const startedAt = nowIso()
  const stages = normalizeStages(input.graph)
  const pending = new Map(stages.map((stage) => [String(stage.id), stage]))
  const completed = new Map<string, ResearchStageResult>()
  const running = new Map<string, Promise<ResearchStageResult>>()
  const blockers: string[] = []
  const maxParallel = Math.max(1, Math.min(16, Number(input.maxParallelStages || 4)))
  const cycleDeadlineMs = Date.now() + Math.max(1, Number(input.timeoutMs || 1))
  let maxObservedParallel = 0

  while (pending.size || running.size) {
    const ready = readyStages([...pending.values()], completed)
    while (running.size < maxParallel && ready.length) {
      const stage = ready.shift()
      if (!stage) break
      pending.delete(String(stage.id))
      const remainingMs = Math.max(0, cycleDeadlineMs - Date.now())
      if (remainingMs <= 0) {
        const failed = failureStage(input, stage, new Error('research_cycle_timeout_exceeded'))
        completed.set(String(stage.id), failed)
        blockers.push(`${String(stage.id)}:research_cycle_timeout_exceeded`)
        continue
      }
      const promise = runResearchStage({ ...input, stage, timeoutMs: remainingMs, cycleDeadlineMs })
        .catch((err: unknown) => failureStage(input, stage, err))
      running.set(String(stage.id), promise)
      maxObservedParallel = Math.max(maxObservedParallel, running.size)
    }
    if (!running.size) {
      const blockedIds = [...pending.keys()]
      blockers.push(...blockedIds.map((id) => `stage_dependencies_unresolved:${id}`))
      for (const stage of pending.values()) {
        const failed = failureStage(input, stage, new Error(`dependencies unresolved: ${(stage.dependencies || []).join(',')}`))
        completed.set(String(stage.id), failed)
      }
      pending.clear()
      break
    }
    const done = await raceResearchStagesUntilDeadline(running, cycleDeadlineMs)
    if (!done) {
      for (const [id, promise] of running.entries()) {
        promise.catch(() => undefined)
        const stage = stages.find((candidate) => String(candidate.id) === id)
        const failed = failureStage(input, stage, new Error('research_cycle_timeout_exceeded'))
        completed.set(id, failed)
        blockers.push(`${id}:research_cycle_timeout_exceeded`)
      }
      for (const [id, stage] of pending.entries()) {
        const failed = failureStage(input, stage, new Error('research_cycle_timeout_exceeded'))
        completed.set(id, failed)
        blockers.push(`${id}:research_cycle_timeout_exceeded`)
      }
      running.clear()
      pending.clear()
      break
    }
    running.delete(done.id)
    completed.set(done.id, done.result)
    if (done.result.status !== 'passed' && pendingStageRequired(stages.find((stage) => String(stage.id) === done.id))) {
      blockers.push(...(done.result.blockers.length ? done.result.blockers.map((blocker) => `${done.id}:${blocker}`) : [`${done.id}:stage_not_passed`]))
    }
  }

  const stageResults = [...completed.values()]
  const record = {
    schema: 'sks.research-cycle-runner.v2',
    cycle: input.cycle,
    readonly: true,
    started_at: startedAt,
    completed_at: nowIso(),
    stage_count: stageResults.length,
    status: blockers.length ? 'blocked' : 'passed',
    blockers: [...new Set(blockers)],
    stages: stageResults.map((stage) => stage.stage_id),
    stage_results: stageResults,
    codex_app_execution_profile: input.plan?.codex_app_execution_profile || null,
    parallelism: {
      max_parallel_stages: maxParallel,
      max_observed_parallel: maxObservedParallel,
      stage_count: stageResults.length,
      critical_path_length: criticalPathLength(stages)
    },
    legacy_final_md_loop: false,
    timeout: {
      budget_ms: Math.max(1, Number(input.timeoutMs || 1)),
      deadline_epoch_ms: cycleDeadlineMs,
      exhausted: Date.now() >= cycleDeadlineMs
    }
  }
  await writeJsonAtomic(path.join(input.dir, 'research', `cycle-${input.cycle}`, 'research-cycle-runner.json'), record)
  await writeJsonAtomic(path.join(input.dir, 'research-cycle-runner.json'), record)
  await appendJsonlBounded(path.join(input.dir, 'events.jsonl'), { ts: nowIso(), type: 'research.cycle_runner.completed', cycle: record.cycle, stage_count: record.stage_count, status: record.status, max_observed_parallel: maxObservedParallel })
  return record
}

export async function raceResearchStagesUntilDeadline<T>(
  running: Map<string, Promise<T>>,
  deadlineEpochMs: number
): Promise<{ id: string; result: T } | null> {
  const remainingMs = Math.max(0, Math.floor(deadlineEpochMs - Date.now()))
  if (remainingMs <= 0) return null
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      ...[...running.entries()].map(async ([id, promise]) => ({ id, result: await promise })),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), remainingMs)
        timer.unref?.()
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function readyStages(pending: any[], completed: Map<string, ResearchStageResult>) {
  return pending.filter((stage) => (Array.isArray(stage.dependencies) ? stage.dependencies : []).every((id: string) => completed.has(String(id))))
}

function normalizeStages(graph: any): any[] {
  const stages = Array.isArray(graph?.work_items) ? graph.work_items : []
  return stages.map((stage: any, index: number) => ({
    ...stage,
    id: String(stage?.id || `research-stage-${index + 1}`),
    dependencies: Array.isArray(stage?.dependencies) ? stage.dependencies.map(String) : []
  }))
}

function pendingStageRequired(stage: any): boolean {
  return stage?.required !== false
}

function failureStage(input: ResearchCycleInput, stage: any, err: unknown): ResearchStageResult {
  const ts = nowIso()
  return {
    schema: 'sks.research-stage-result.v1',
    mission_id: String(input.plan?.mission_id || ''),
    cycle: input.cycle,
    stage_id: String(stage?.id || 'unknown'),
    stage_kind: 'verification',
    status: 'failed',
    started_at: ts,
    completed_at: ts,
    input_artifacts: [],
    output_artifacts: [],
    backend: input.backend,
    worker_result_path: null,
    blockers: [err instanceof Error ? err.message : String(err)],
    metrics: {}
  }
}

function criticalPathLength(stages: any[]): number {
  const byId = new Map(stages.map((stage) => [String(stage.id), stage]))
  const memo = new Map<string, number>()
  const visit = (id: string, seen = new Set<string>()): number => {
    if (memo.has(id)) return memo.get(id)!
    if (seen.has(id)) return 1
    seen.add(id)
    const stage = byId.get(id)
    const deps = Array.isArray(stage?.dependencies) ? stage.dependencies.map(String) : []
    const value = 1 + (deps.length ? Math.max(...deps.map((dep: string) => visit(dep, new Set(seen)))) : 0)
    memo.set(id, value)
    return value
  }
  return stages.length ? Math.max(...stages.map((stage) => visit(String(stage.id)))) : 0
}

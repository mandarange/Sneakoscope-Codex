import path from 'node:path'
import { appendJsonlBounded, nowIso, writeJsonAtomic } from '../fsx.js'
import { runResearchStage } from './research-stage-runner.js'

export async function runResearchCycle(dir: string, graph: any = null, opts: any = {}) {
  const startedAt = nowIso()
  const stages = Array.isArray(graph?.work_items) ? graph.work_items : []
  const stageResults = []
  for (const stage of stages) {
    stageResults.push(await runResearchStage(dir, stage, { status: opts.status || 'planned', startedAt }))
  }
  const record = {
    schema: 'sks.research-cycle-runner.v1',
    cycle: opts.cycle || 0,
    readonly: true,
    started_at: startedAt,
    completed_at: nowIso(),
    stage_count: stageResults.length,
    status: opts.status || 'planned',
    stages: stageResults.map((stage) => stage.stage_id)
  }
  await writeJsonAtomic(path.join(dir, 'research-cycle-runner.json'), record)
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.cycle_runner.recorded', cycle: record.cycle, stage_count: record.stage_count })
  return record
}

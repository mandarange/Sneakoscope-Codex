import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export async function runResearchStage(dir: string, stage: any, opts: any = {}) {
  const record = {
    schema: 'sks.research-stage-run.v1',
    stage_id: stage?.id || opts.stageId || 'unknown',
    status: opts.status || 'recorded',
    readonly: true,
    started_at: opts.startedAt || nowIso(),
    completed_at: nowIso(),
    notes: opts.notes || []
  }
  await writeJsonAtomic(path.join(dir, 'research', 'stages', `${record.stage_id}.json`), record)
  return record
}

import path from 'node:path'
import { appendJsonlBounded, nowIso, writeJsonAtomic } from '../fsx.js'
import { missionDir } from '../mission.js'

export const MAD_DB_LEDGER_EVENT_SCHEMA = 'sks.mad-db-ledger-event.v1'

export async function appendMadDbLedgerEvent(root: string, missionId: string, event: Record<string, unknown>) {
  const row = {
    schema: MAD_DB_LEDGER_EVENT_SCHEMA,
    ts: nowIso(),
    mission_id: missionId,
    ...event
  }
  const dir = missionDir(root, missionId)
  await appendJsonlBounded(path.join(dir, 'mad-db-ledger.jsonl'), row)
  await writeJsonAtomic(path.join(dir, 'mad-db-ledger.latest.json'), row).catch(() => undefined)
  return row
}

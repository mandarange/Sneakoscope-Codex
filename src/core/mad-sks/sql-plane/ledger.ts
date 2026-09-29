import path from 'node:path'
import { appendJsonlBounded, nowIso, writeJsonAtomic } from '../../fsx.js'
import { MAD_SKS_SQL_PLANE_LATEST_LEDGER_FILE, MAD_SKS_SQL_PLANE_LEDGER_FILE, madSksSqlPlaneDir } from './paths.js'

export const MAD_SKS_SQL_PLANE_LEDGER_EVENT_SCHEMA = 'sks.mad-sks-sql-plane-ledger-event.v1'

export async function appendMadSksSqlPlaneLedgerEvent(root: string, missionId: string, event: Record<string, unknown>) {
  const row = {
    schema: MAD_SKS_SQL_PLANE_LEDGER_EVENT_SCHEMA,
    ts: nowIso(),
    mission_id: missionId,
    ...event
  }
  const dir = madSksSqlPlaneDir(root, missionId)
  await appendJsonlBounded(path.join(dir, MAD_SKS_SQL_PLANE_LEDGER_FILE), row)
  // The authoritative append above already succeeded or threw; this is a
  // convenience "latest" pointer only. Its failure used to vanish silently
  // (20차 P1-7) — readers of the latest-event pointer could see a stale
  // pointer with no signal anything was wrong.
  await writeJsonAtomic(path.join(dir, MAD_SKS_SQL_PLANE_LATEST_LEDGER_FILE), row).catch((err: unknown) => {
    console.error(`MAD-SKS SQL-plane ledger: failed to update latest pointer for mission ${missionId}: ${err instanceof Error ? err.message : String(err)}`)
  })
  return row
}


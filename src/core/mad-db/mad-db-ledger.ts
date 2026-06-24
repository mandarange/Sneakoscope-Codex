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

export async function appendMadDbOperationLifecycle(root: string, missionId: string, input: {
  type: 'db_operation.started' | 'db_operation.allowed' | 'db_operation.succeeded' | 'db_operation.failed'
  operationId: string
  cycleId?: string | null
  mcpServer?: string | null
  toolName?: string | null
  sqlHash?: string | null
  destructive?: boolean
  resultStatus?: 'pending_tool_result' | 'succeeded' | 'failed'
  rowCount?: number | null
  error?: string | null
}) {
  return appendMadDbLedgerEvent(root, missionId, {
    type: input.type,
    operation_id: input.operationId,
    cycle_id: input.cycleId || null,
    mcp_server: input.mcpServer || null,
    tool_name: input.toolName || null,
    sql_hash: input.sqlHash || null,
    destructive: input.destructive === true,
    result_status: input.resultStatus || 'pending_tool_result',
    row_count: input.rowCount ?? null,
    error: input.error || null
  })
}

import fs from 'node:fs/promises'
import path from 'node:path'
import { appendJsonlBounded, nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'
import { missionDir } from '../mission.js'
import { appendMadDbOperationLifecycle } from './mad-db-ledger.js'

export interface MadDbLifecycleHook {
  mission_id: string
  operation_id: string
  cycle_id?: string | null
  tool_name?: string | null
  sql_hash?: string | null
  mcp_server?: string | null
  destructive?: boolean
}

const PENDING_FILE = 'mad-db-lifecycle-pending.jsonl'
const PENDING_LATEST_FILE = 'mad-db-lifecycle-pending.latest.json'

export async function recordPendingMadDbLifecycleHook(root: string, missionId: string, hook: MadDbLifecycleHook) {
  const dir = missionDir(root, missionId)
  const row = {
    schema: 'sks.mad-db-lifecycle-pending.v1',
    ts: nowIso(),
    mission_id: missionId,
    hook
  }
  await appendJsonlBounded(path.join(dir, PENDING_FILE), row)
  await writeJsonAtomic(path.join(dir, PENDING_LATEST_FILE), row).catch(() => undefined)
  return row
}

export async function readLatestPendingMadDbLifecycleHook(root: string, missionId: string, payload: any = {}): Promise<MadDbLifecycleHook | null> {
  const dir = missionDir(root, missionId)
  const embedded = lifecycleHookFromUnknown(payload)
  if (embedded) return embedded
  const latest = await readJson<any>(path.join(dir, PENDING_LATEST_FILE), null).catch(() => null)
  const latestHook = lifecycleHookFromUnknown(latest?.hook)
  if (latestHook && hookMatchesPayload(latestHook, payload)) return latestHook
  const text = await readText(path.join(dir, PENDING_FILE), '').catch(() => '')
  const rows = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse()
  for (const line of rows.slice(0, 50)) {
    try {
      const row = JSON.parse(line)
      const hook = lifecycleHookFromUnknown(row?.hook)
      if (hook && hookMatchesPayload(hook, payload)) return hook
    } catch {
      // Ignore malformed pending rows.
    }
  }
  return null
}

export async function recordMadDbToolResult(input: {
  root: string
  missionId: string
  hook: MadDbLifecycleHook
  ok: boolean
  rowCount?: number | null
  error?: string | null
}) {
  const terminalType = input.ok ? 'db_operation.succeeded' : 'db_operation.failed'
  if (await hasTerminalLifecycleEvent(input.root, input.missionId, input.hook.operation_id)) {
    return {
      schema: 'sks.mad-db-tool-result-lifecycle.v1',
      ok: true,
      skipped: true,
      reason: 'mad_db_operation_terminal_event_already_recorded',
      operation_id: input.hook.operation_id
    }
  }
  const event = await appendMadDbOperationLifecycle(input.root, input.missionId, {
    type: terminalType,
    operationId: input.hook.operation_id,
    cycleId: input.hook.cycle_id || null,
    mcpServer: input.hook.mcp_server || null,
    toolName: input.hook.tool_name || null,
    sqlHash: input.hook.sql_hash || null,
    destructive: input.hook.destructive === true,
    resultStatus: input.ok ? 'succeeded' : 'failed',
    rowCount: input.rowCount ?? null,
    error: input.error || null
  })
  await markPendingHookResolved(input.root, input.missionId, input.hook, input.ok)
  return {
    schema: 'sks.mad-db-tool-result-lifecycle.v1',
    ok: true,
    skipped: false,
    operation_id: input.hook.operation_id,
    result_status: input.ok ? 'succeeded' : 'failed',
    event
  }
}

export function lifecycleHookFromUnknown(value: any): MadDbLifecycleHook | null {
  const candidate = value?.ledger_result_hook || value?.mad_db?.ledger_result_hook || value
  const missionId = stringOrNull(candidate?.mission_id || candidate?.missionId)
  const operationId = stringOrNull(candidate?.operation_id || candidate?.operationId)
  if (!missionId || !operationId) return null
  return {
    mission_id: missionId,
    operation_id: operationId,
    cycle_id: stringOrNull(candidate?.cycle_id || candidate?.cycleId),
    tool_name: stringOrNull(candidate?.tool_name || candidate?.toolName),
    sql_hash: stringOrNull(candidate?.sql_hash || candidate?.sqlHash),
    mcp_server: stringOrNull(candidate?.mcp_server || candidate?.mcpServer),
    destructive: candidate?.destructive === true
  }
}

function hookMatchesPayload(hook: MadDbLifecycleHook, payload: any) {
  if (!hook.tool_name) return true
  const toolText = [
    payload.tool_name,
    payload.toolName,
    payload.name,
    payload.tool?.name,
    payload.server,
    payload.mcp_tool,
    payload.tool,
    payload.type
  ].filter(Boolean).join(' ').toLowerCase()
  if (!toolText) return true
  return toolText.includes(String(hook.tool_name).toLowerCase()) || String(hook.tool_name).toLowerCase().includes(toolText)
}

async function hasTerminalLifecycleEvent(root: string, missionId: string, operationId: string) {
  const ledger = path.join(missionDir(root, missionId), 'mad-db-ledger.jsonl')
  const text = await readText(ledger, '').catch(() => '')
  return String(text).split(/\r?\n/).some((line) => {
    if (!line.includes(operationId)) return false
    return line.includes('db_operation.succeeded') || line.includes('db_operation.failed')
  })
}

async function markPendingHookResolved(root: string, missionId: string, hook: MadDbLifecycleHook, ok: boolean) {
  const dir = missionDir(root, missionId)
  const row = {
    schema: 'sks.mad-db-lifecycle-pending-resolution.v1',
    ts: nowIso(),
    mission_id: missionId,
    operation_id: hook.operation_id,
    cycle_id: hook.cycle_id || null,
    result_status: ok ? 'succeeded' : 'failed'
  }
  await appendJsonlBounded(path.join(dir, 'mad-db-lifecycle-resolved.jsonl'), row).catch(() => undefined)
  await fs.rm(path.join(dir, PENDING_LATEST_FILE), { force: true }).catch(() => undefined)
}

function stringOrNull(value: unknown): string | null {
  const text = String(value || '').trim()
  return text ? text : null
}

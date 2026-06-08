import path from 'node:path'
import { appendJsonlBounded, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { findLatestMission, missionDir } from '../mission.js'

export const MAD_DB_CAPABILITY_SCHEMA = 'sks.mad-db-capability.v1'
export const MAD_DB_CAPABILITY_FILE = 'mad-db-capability.json'
export const MAD_DB_ACK = 'I AUTHORIZE ONE-CYCLE DB BREAK-GLASS'
export const MAD_DB_MAX_TTL_MS = 2 * 60 * 60 * 1000

export interface MadDbCapability {
  schema: typeof MAD_DB_CAPABILITY_SCHEMA
  mission_id: string
  cycle_id: string
  enabled: boolean
  created_at: string
  expires_at: string
  one_cycle_only: true
  priority: 'highest'
  scope: 'all_database_mutations'
  operator_ack: {
    phrase: typeof MAD_DB_ACK
    accepted_at: string
    cwd: string
  }
  consumed: boolean
  consumed_at: string | null
  consumed_by: string | null
  max_operations: number
  operation_count: number
}

export async function createMadDbCapability(root: string, input: {
  missionId: string
  ack: string
  cwd?: string
  cycleId?: string
  ttlMs?: number
}): Promise<MadDbCapability> {
  if (input.ack !== MAD_DB_ACK) throw new Error('mad_db_ack_phrase_mismatch')
  const createdAt = nowIso()
  const ttlMs = Math.min(MAD_DB_MAX_TTL_MS, Math.max(1, Math.floor(Number(input.ttlMs || MAD_DB_MAX_TTL_MS))))
  const capability: MadDbCapability = {
    schema: MAD_DB_CAPABILITY_SCHEMA,
    mission_id: input.missionId,
    cycle_id: input.cycleId || `mad-db-${Date.now().toString(36)}`,
    enabled: true,
    created_at: createdAt,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    one_cycle_only: true,
    priority: 'highest',
    scope: 'all_database_mutations',
    operator_ack: {
      phrase: MAD_DB_ACK,
      accepted_at: createdAt,
      cwd: path.resolve(input.cwd || process.cwd())
    },
    consumed: false,
    consumed_at: null,
    consumed_by: null,
    max_operations: Math.max(1, Math.floor(Number(process.env.SKS_MAD_DB_MAX_OPERATIONS || 20))),
    operation_count: 0
  }
  const dir = missionDir(root, input.missionId)
  await writeJsonAtomic(path.join(dir, MAD_DB_CAPABILITY_FILE), capability)
  await appendJsonlBounded(path.join(dir, 'mad-db-ledger.jsonl'), { ts: nowIso(), type: 'capability.created', mission_id: capability.mission_id, cycle_id: capability.cycle_id, expires_at: capability.expires_at })
  return capability
}

export async function readMadDbCapability(root: string, missionId: string): Promise<MadDbCapability | null> {
  const capability = await readJson<MadDbCapability | null>(path.join(missionDir(root, missionId), MAD_DB_CAPABILITY_FILE), null)
  return capability?.schema === MAD_DB_CAPABILITY_SCHEMA ? capability : null
}

export async function resolveMadDbMissionId(root: string, state: any = {}, explicitMissionId: string | null = null) {
  if (explicitMissionId && explicitMissionId !== 'latest') return explicitMissionId
  if (state?.mission_id) return String(state.mission_id)
  return findLatestMission(root)
}

export function isMadDbCapabilityActive(capability: MadDbCapability | null, nowMs = Date.now()) {
  if (!capability) return false
  const expires = Date.parse(capability.expires_at || '')
  return capability.enabled === true
    && capability.consumed !== true
    && capability.one_cycle_only === true
    && Number(capability.operation_count || 0) < Number(capability.max_operations || 20)
    && Number.isFinite(expires)
    && expires > nowMs
}

export async function recordMadDbOperation(root: string, missionId: string, input: { operationId?: string; toolName?: string; sqlHash?: string } = {}) {
  const capability = await readMadDbCapability(root, missionId)
  if (!isMadDbCapabilityActive(capability)) return capability
  const operationCount = Number(capability!.operation_count || 0) + 1
  const maxOperations = Math.max(1, Number(capability!.max_operations || 20))
  const updated: MadDbCapability = {
    ...capability!,
    operation_count: operationCount,
    max_operations: maxOperations
  }
  const dir = missionDir(root, missionId)
  await writeJsonAtomic(path.join(dir, MAD_DB_CAPABILITY_FILE), updated)
  await appendJsonlBounded(path.join(dir, 'mad-db-ledger.jsonl'), {
    ts: nowIso(),
    type: 'db_operation.counted',
    mission_id: missionId,
    cycle_id: updated.cycle_id,
    operation_id: input.operationId || null,
    tool_name: input.toolName || null,
    sql_hash: input.sqlHash || null,
    operation_count: operationCount,
    max_operations: maxOperations
  })
  if (operationCount >= maxOperations) {
    return consumeMadDbCapability(root, missionId, { consumedBy: 'db-safety-checkDbOperation', reason: 'mad_db_max_operations_reached' })
  }
  return updated
}

export async function consumeMadDbCapability(root: string, missionId: string, input: { consumedBy?: string; reason?: string } = {}) {
  const capability = await readMadDbCapability(root, missionId)
  if (!capability || capability.consumed === true) return capability
  const consumed: MadDbCapability = {
    ...capability!,
    consumed: true,
    consumed_at: nowIso(),
    consumed_by: input.consumedBy || input.reason || 'db-safety-policy-resolver'
  }
  const dir = missionDir(root, missionId)
  await writeJsonAtomic(path.join(dir, MAD_DB_CAPABILITY_FILE), consumed)
  await writeJsonAtomic(path.join(dir, 'mad-db-capability.consumed.json'), consumed)
  await appendJsonlBounded(path.join(dir, 'mad-db-ledger.jsonl'), { ts: nowIso(), type: 'capability.consumed', mission_id: missionId, cycle_id: consumed.cycle_id, consumed_by: consumed.consumed_by })
  return consumed
}

export async function closeMadDbCycle(root: string, missionId: string, cycleId: string): Promise<MadDbCapability | null> {
  const capability = await readMadDbCapability(root, missionId)
  if (!capability || capability.cycle_id !== cycleId) return capability
  if (capability.consumed === true) return capability
  return consumeMadDbCapability(root, missionId, { consumedBy: 'mad-db-cycle-close', reason: 'mad_db_cycle_closed' })
}

export async function revokeMadDbCapability(root: string, missionId: string, reason = 'operator_revoked') {
  const capability = await readMadDbCapability(root, missionId)
  if (!capability) return null
  const revoked = { ...capability, enabled: false, revoked_at: nowIso(), revoke_reason: reason }
  const dir = missionDir(root, missionId)
  await writeJsonAtomic(path.join(dir, MAD_DB_CAPABILITY_FILE), revoked)
  await appendJsonlBounded(path.join(dir, 'mad-db-ledger.jsonl'), { ts: nowIso(), type: 'capability.revoked', mission_id: missionId, cycle_id: capability.cycle_id, reason })
  return revoked
}

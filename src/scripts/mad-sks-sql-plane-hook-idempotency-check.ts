#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMission } from '../core/mission.js'
import { checkDbOperation } from '../core/db-safety.js'
import { createMadSksSqlPlaneCapability, MAD_SKS_SQL_PLANE_ACK, readMadSksSqlPlaneCapability } from '../core/mad-sks/sql-plane/capability.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-sks-sql-plane-idempotency-'))
const mission = await createMission(root, { mode: 'mad-sks', prompt: 'idempotency fixture' })
await createMadSksSqlPlaneCapability(root, { missionId: mission.id, ack: MAD_SKS_SQL_PLANE_ACK, cwd: root, projectRef: 'fixture-project-ref', status: 'active' })
const payload = { tool_name: 'supabase.execute_sql', tool_call_id: 'canonical-call-id-1', sql: 'delete from public.fixture;' }
const first: any = await checkDbOperation(root, { mission_id: mission.id }, payload)
const second: any = await checkDbOperation(root, { mission_id: mission.id }, payload)
const cap = await readMadSksSqlPlaneCapability(root, mission.id)

assertGate(first.allowed === true && second.allowed === true, 'same canonical call should be allowed while active', { first, second })
assertGate(first.mad_sks_sql_plane.operation_id === second.mad_sks_sql_plane.operation_id, 'same canonical tool_call_id must map to the same operation', { first, second })
assertGate(second.mad_sks_sql_plane.idempotent_reservation_reused === true, 'second reservation must be marked reused', second)
assertGate(Boolean(cap) && cap!.counters.attempts === 1 && cap!.counters.reserved === 1, 'PreToolUse/PermissionRequest duplicate handling must not double-count one call', cap || {})
emitGate('mad-sks-sql-plane:hook-idempotency', { operation_id: first.mad_sks_sql_plane.operation_id, counters: cap!.counters })

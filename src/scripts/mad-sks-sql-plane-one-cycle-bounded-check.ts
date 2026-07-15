#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { closeMadSksSqlPlaneCycle, createMadSksSqlPlaneCapability, isMadSksSqlPlaneCapabilityActive, MAD_SKS_SQL_PLANE_ACK, readMadSksSqlPlaneCapability } from '../core/mad-sks/sql-plane/capability.js'
import { checkDbOperation } from '../core/db-safety.js'
import { createMission } from '../core/mission.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-sks-sql-plane-bounded-'))
const mission = await createMission(root, { mode: 'mad-sks', prompt: 'bounded fixture' })
const cap = await createMadSksSqlPlaneCapability(root, { missionId: mission.id, ack: MAD_SKS_SQL_PLANE_ACK, ttlMs: 60000, projectRef: 'fixture-project-ref', status: 'active' })
assertGate(isMadSksSqlPlaneCapabilityActive(cap) === true && Date.parse(cap.expires_at) > Date.now(), 'capability must start active with bounded TTL', cap)
const payload = { tool_name: 'supabase.execute_sql', tool_call_id: 'bounded-call-1', sql: 'update users set flag = true where id = 1' }
const first = await checkDbOperation(root, { mission_id: mission.id }, payload)
const afterFirst = await readMadSksSqlPlaneCapability(root, mission.id)
assertGate(first.allowed === true && afterFirst.counters.reserved === 1 && afterFirst.status === 'active', 'capability must reserve one operation and remain active before final close', { first, afterFirst })
const second = await checkDbOperation(root, { mission_id: mission.id }, payload)
const afterSecond = await readMadSksSqlPlaneCapability(root, mission.id)
assertGate(second.allowed === true && second.mad_sks_sql_plane?.idempotent_reservation_reused === true && afterSecond.counters.reserved === 1, 'same canonical tool_call_id must be idempotent and not double-counted', { second, afterSecond })

const closed = await closeMadSksSqlPlaneCycle(root, mission.id, cap.cycle_id)
assertGate(closed?.status === 'closed' && isMadSksSqlPlaneCapabilityActive(closed) === false, 'explicit cycle close must deactivate active capability', closed)
emitGate('mad-sks-sql-plane:one-cycle-bounded', { cycle_id: cap.cycle_id, reserved: afterSecond.counters.reserved, close_cycle: closed?.status === 'closed' })

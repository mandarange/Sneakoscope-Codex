#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const missionMod = await importDist('core/mission.js')
const capMod = await importDist('core/mad-sks/sql-plane/capability.js')
const db = await importDist('core/db-safety.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-sks-sql-plane-policy-'))
const mission = await missionMod.createMission(root, { mode: 'mad-sks', prompt: 'fixture' })
const state = { mission_id: mission.id }
const denied = await db.checkDbOperation(root, state, { tool_name: 'supabase.execute_sql', sql: 'drop table users;' })
assertGate(denied.allowed === false, 'without MAD-SKS SQL-plane capability destructive DB must be blocked', denied)
await capMod.createMadSksSqlPlaneCapability(root, { missionId: mission.id, ack: capMod.MAD_SKS_SQL_PLANE_ACK, cwd: root, projectRef: 'fixture-project-ref', status: 'active' })
const allowed = await db.checkDbOperation(root, state, { tool_name: 'supabase.execute_sql', tool_call_id: 'priority-drop-table', sql: 'drop table users;' })
assertGate(allowed.allowed === true && allowed.mad_sks_sql_plane?.active === true, 'MAD-SKS SQL-plane capability must allow destructive DB mutation with highest priority', allowed)
const after = await capMod.readMadSksSqlPlaneCapability(root, mission.id)
assertGate(after.status === 'active' && after.counters.reserved === 1, 'MAD-SKS SQL-plane capability must remain active and reserve exactly one operation', after)
emitGate('mad-sks-sql-plane:priority-resolver', { cycle_id: after.cycle_id, reserved: after.counters.reserved })

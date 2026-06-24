#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const missionMod = await importDist('core/mission.js')
const capMod = await importDist('core/mad-db/mad-db-capability.js')
const db = await importDist('core/db-safety.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-db-matrix-'))
const mission = await missionMod.createMission(root, { mode: 'mad-sks', prompt: 'fixture' })
const madSksState = { mission_id: mission.id, mode: 'MADSKS', mad_sks_active: true, mad_sks_gate_file: 'mad-sks-gate.json' }
fs.writeFileSync(path.join(mission.dir, 'mad-sks-gate.json'), JSON.stringify({ passed: false, permissions_deactivated: false }, null, 2))
const catastrophic = await db.checkDbOperation(root, madSksState, { tool_name: 'supabase.execute_sql', sql: 'truncate users;' })
assertGate(catastrophic.allowed === false && catastrophic.reasons.includes('mad_sks_catastrophic_db_operation_blocked'), 'MAD-SKS catastrophic guard must remain without Mad-DB', catastrophic)
await capMod.createMadDbCapability(root, { missionId: mission.id, ack: capMod.MAD_DB_ACK, cwd: root, projectRef: 'fixture-project-ref', status: 'active' })
const breakGlass = await db.checkDbOperation(root, madSksState, { tool_name: 'supabase.execute_sql', tool_call_id: 'matrix-truncate-active', sql: 'truncate users;' })
assertGate(breakGlass.allowed === true && breakGlass.mad_db?.active === true, 'Mad-DB must override DB mutation guard only while active', breakGlass)
await capMod.consumeMadDbCapability(root, mission.id, { consumedBy: 'fixture-cycle-close' })
const afterConsume = await db.checkDbOperation(root, madSksState, { tool_name: 'supabase.execute_sql', tool_call_id: 'matrix-truncate-closed', sql: 'truncate users;' })
assertGate(afterConsume.allowed === false, 'after bounded cycle close, MAD-SKS catastrophic guard must block again', afterConsume)
emitGate('mad-db:safety-conflict-matrix', { states: ['mad-sks-blocks', 'mad-db-allows-cycle', 'mad-sks-blocks-after-cycle-close'] })

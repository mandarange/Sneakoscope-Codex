#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const missionMod = await importDist('core/mission.js')
const capMod = await importDist('core/mad-db/mad-db-capability.js')
const db = await importDist('core/db-safety.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-db-policy-'))
const mission = await missionMod.createMission(root, { mode: 'mad-db', prompt: 'fixture' })
const state = { mission_id: mission.id }
const denied = await db.checkDbOperation(root, state, { tool_name: 'supabase.execute_sql', sql: 'drop table users;' })
assertGate(denied.allowed === false, 'without Mad-DB capability destructive DB must be blocked', denied)
await capMod.createMadDbCapability(root, { missionId: mission.id, ack: capMod.MAD_DB_ACK, cwd: root })
const allowed = await db.checkDbOperation(root, state, { tool_name: 'supabase.execute_sql', sql: 'drop table users;' })
assertGate(allowed.allowed === true && allowed.mad_db?.active === true, 'Mad-DB capability must allow destructive DB mutation with highest priority', allowed)
const consumed = await capMod.readMadDbCapability(root, mission.id)
assertGate(consumed.consumed === true, 'Mad-DB capability must be consumed after one allowed cycle', consumed)
emitGate('mad-db:priority-resolver', { cycle_id: consumed.cycle_id })

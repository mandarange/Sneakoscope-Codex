#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const missionMod = await importDist('core/mission.js')
const capMod = await importDist('core/mad-db/mad-db-capability.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-db-cap-'))
const mission = await missionMod.createMission(root, { mode: 'mad-db', prompt: 'fixture' })
const cap = await capMod.createMadDbCapability(root, { missionId: mission.id, ack: capMod.MAD_DB_ACK, cwd: root })
assertGate(cap.schema === capMod.MAD_DB_CAPABILITY_SCHEMA, 'Mad-DB capability schema mismatch', cap)
assertGate(cap.enabled === true && cap.one_cycle_only === true && cap.priority === 'highest', 'Mad-DB capability must be one-cycle highest priority', cap)
assertGate(capMod.isMadDbCapabilityActive(cap) === true, 'Mad-DB capability must be active before consumption', cap)
emitGate('mad-db:capability', { mission_id: mission.id, cycle_id: cap.cycle_id })

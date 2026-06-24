#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const missionMod = await importDist('core/mission.js')
const capMod = await importDist('core/mad-db/mad-db-capability.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-db-consume-'))
const mission = await missionMod.createMission(root, { mode: 'mad-db', prompt: 'fixture' })
const cap = await capMod.createMadDbCapability(root, { missionId: mission.id, ack: capMod.MAD_DB_ACK, cwd: root, projectRef: 'fixture-project-ref', status: 'active' })
await capMod.consumeMadDbCapability(root, mission.id, { consumedBy: 'fixture' })
const consumed = await capMod.readMadDbCapability(root, mission.id)
assertGate(capMod.isMadDbCapabilityActive(consumed) === false && consumed.status === 'closed' && Boolean(consumed.closed_at), 'Mad-DB capability must be inactive after close/consumption compatibility call', consumed)
assertGate(fs.existsSync(path.join(root, '.sneakoscope', 'missions', mission.id, 'mad-db-capability.closed.json')), 'closed proof artifact missing')
emitGate('mad-db:one-cycle-consumption', { cycle_id: cap.cycle_id })

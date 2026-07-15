#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const missionMod = await importDist('core/mission.js')
const capMod = await importDist('core/mad-sks/sql-plane/capability.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-sks-sql-plane-consume-'))
const mission = await missionMod.createMission(root, { mode: 'mad-sks', prompt: 'fixture' })
const cap = await capMod.createMadSksSqlPlaneCapability(root, { missionId: mission.id, ack: capMod.MAD_SKS_SQL_PLANE_ACK, cwd: root, projectRef: 'fixture-project-ref', status: 'active' })
await capMod.consumeMadSksSqlPlaneCapability(root, mission.id, { consumedBy: 'fixture' })
const consumed = await capMod.readMadSksSqlPlaneCapability(root, mission.id)
assertGate(capMod.isMadSksSqlPlaneCapabilityActive(consumed) === false && consumed.status === 'closed' && Boolean(consumed.closed_at), 'MAD-SKS SQL-plane capability must be inactive after close/consumption compatibility call', consumed)
assertGate(fs.existsSync(path.join(root, '.sneakoscope', 'missions', mission.id, 'mad-sks-sql-plane-capability.closed.json')), 'closed proof artifact missing')
emitGate('mad-sks-sql-plane:one-cycle-consumption', { cycle_id: cap.cycle_id })

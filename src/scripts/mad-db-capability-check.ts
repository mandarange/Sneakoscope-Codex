#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const missionMod = await importDist('core/mission.js')
const capMod = await importDist('core/mad-db/mad-db-capability.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-db-cap-'))
const mission = await missionMod.createMission(root, { mode: 'mad-db', prompt: 'fixture' })
const cap = await capMod.createMadDbCapability(root, {
  missionId: mission.id,
  ack: capMod.MAD_DB_ACK,
  cwd: root,
  projectRef: 'fixture-project-ref',
  runtimeSessionId: 'fixture-session',
  profilePath: '.sneakoscope/missions/M/mad-db/runtime/codex-mad-db.config.toml',
  profileSha256: 'fixture-profile-sha',
  status: 'active'
})
assertGate(cap.schema === capMod.MAD_DB_CAPABILITY_SCHEMA, 'Mad-DB capability schema mismatch', cap)
assertGate(cap.legacy_compat?.one_cycle_only === true && cap.legacy_compat?.priority === 'highest', 'Mad-DB capability must retain legacy one-cycle priority metadata', cap)
assertGate(cap.project_ref === 'fixture-project-ref' && cap.runtime_session_id === 'fixture-session' && cap.transport.profile_sha256 === 'fixture-profile-sha', 'Mad-DB capability v2 must bind project/session/profile', cap)
assertGate(cap.scope.sql_plane === 'all_mutations' && cap.scope.control_plane === 'deny' && cap.scope.operations.includes('truncate'), 'Mad-DB capability v2 must authorize SQL-plane operation classes only', cap)
assertGate(capMod.isMadDbCapabilityActive(cap) === true, 'Mad-DB capability must be active before consumption', cap)
emitGate('mad-db:capability', { mission_id: mission.id, cycle_id: cap.cycle_id })

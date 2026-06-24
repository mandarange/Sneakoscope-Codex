#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { routeByDollarCommand } from '../core/routes.js'
import { closeMadDbCycle, isMadDbCapabilityActive } from '../core/mad-db/mad-db-capability.js'
import { closeMadDbRuntimeProfile } from '../core/mad-db/mad-db-runtime-profile.js'
import { madDbRouteIdentityProof, prepareMadDbMission } from '../core/mad-db/mad-db-coordinator.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-route-identity-'))
const prepared = await prepareMadDbMission({
  root,
  task: '$MAD-DB truncate public.fixture',
  args: ['--project-ref', 'fixture-project-ref', '--target', 'preview'],
  verifyTools: false,
  runtimeSessionId: 'route-identity-session'
})
const proof = await madDbRouteIdentityProof(root, prepared.mission_id)

assertGate(routeByDollarCommand('MAD-DB')?.id === 'MadDB', '$MAD-DB must resolve to first-class MadDB route', routeByDollarCommand('MAD-DB'))
assertGate(routeByDollarCommand('MAD-SKS')?.id === 'MadSKS', '$MAD-SKS must remain the scoped permission route', routeByDollarCommand('MAD-SKS'))
assertGate(prepared.ok === true && prepared.capability.mission_id === prepared.mission_id, 'MadDB prepare must create one authoritative mission/capability', prepared)
assertGate(prepared.capability.runtime_session_id === 'route-identity-session' && prepared.capability.transport.profile_sha256 === prepared.runtime_profile.profile_sha256, 'capability must bind the runtime profile hash/session', prepared.capability)
assertGate(isMadDbCapabilityActive(prepared.capability) === true, 'prepared capability must be active/transport-ready', prepared.capability)
assertGate(proof.ok === true && proof.same_mission === true && proof.route_command === '$MAD-DB', 'route identity proof mismatch', proof)

await closeMadDbRuntimeProfile({ root, missionId: prepared.mission_id, reason: 'route_identity_check' })
await closeMadDbCycle(root, prepared.mission_id, prepared.cycle_id, 'route_identity_check')
emitGate('mad-db:route-identity', { mission_id: prepared.mission_id, cycle_id: prepared.cycle_id, profile_sha256: prepared.runtime_profile.profile_sha256 })

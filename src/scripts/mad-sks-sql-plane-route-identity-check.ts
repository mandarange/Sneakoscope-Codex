#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { routeByDollarCommand } from '../core/routes.js'
import { closeMadSksSqlPlaneCycle, isMadSksSqlPlaneCapabilityActive } from '../core/mad-sks/sql-plane/capability.js'
import { closeMadSksSqlPlaneRuntimeProfile } from '../core/mad-sks/sql-plane/runtime-profile.js'
import { madSksSqlPlaneRouteIdentityProof, prepareMadSksSqlPlaneMission } from '../core/mad-sks/sql-plane/coordinator.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-sks-sql-plane-route-identity-'))
const prepared = await prepareMadSksSqlPlaneMission({
  root,
  task: '$MAD-SKS truncate public.fixture',
  args: ['--project-ref', 'fixture-project-ref', '--target', 'preview'],
  verifyTools: false,
  runtimeSessionId: 'route-identity-session',
  route: 'MadSKS',
  routeCommand: '$MAD-SKS'
})
const proof = await madSksSqlPlaneRouteIdentityProof(root, prepared.mission_id)

assertGate(routeByDollarCommand('MAD-SKS')?.id === 'MadSKS', '$MAD-SKS must be the merged scoped permission + SQL-plane route', routeByDollarCommand('MAD-SKS'))
assertGate(prepared.ok === true && prepared.capability.mission_id === prepared.mission_id, 'MAD-SKS sql-plane prepare must create one authoritative mission/capability', prepared)
assertGate(prepared.capability.runtime_session_id === 'route-identity-session' && prepared.capability.transport.profile_sha256 === prepared.runtime_profile.profile_sha256, 'capability must bind the runtime profile hash/session', prepared.capability)
assertGate(isMadSksSqlPlaneCapabilityActive(prepared.capability) === true, 'prepared capability must be active/transport-ready', prepared.capability)
assertGate(proof.ok === true && proof.same_mission === true && proof.route_command === '$MAD-SKS' && proof.current_route_accepted === true, 'route identity proof mismatch', proof)

await closeMadSksSqlPlaneRuntimeProfile({ root, missionId: prepared.mission_id, reason: 'route_identity_check' })
await closeMadSksSqlPlaneCycle(root, prepared.mission_id, prepared.cycle_id, 'route_identity_check')
emitGate('mad-sks:sql-plane-route-identity', { mission_id: prepared.mission_id, cycle_id: prepared.cycle_id, profile_sha256: prepared.runtime_profile.profile_sha256 })

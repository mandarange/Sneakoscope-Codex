import { initProject } from '../init.js'
import { createMission, findLatestMission, setCurrent } from '../mission.js'
import { exists, sksRoot } from '../fsx.js'
import path from 'node:path'
import { createMadDbCapability, isMadDbCapabilityActive, MAD_DB_ACK, readMadDbCapability, resolveMadDbMissionId, revokeMadDbCapability } from '../mad-db/mad-db-capability.js'

export async function madDbCommand(args: string[] = []) {
  const action = String(args[0] && !String(args[0]).startsWith('--') ? args[0] : 'status')
  const rest = action === args[0] ? args.slice(1) : args
  const root = await sksRoot()
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {})
  if (action === 'enable') return enableMadDb(root, rest)
  if (action === 'revoke') return revokeMadDb(root, rest)
  if (action === 'status') return statusMadDb(root, rest)
  console.error('Usage: sks mad-db enable --ack "I AUTHORIZE ONE-CYCLE DB BREAK-GLASS" [--mission latest|new|M-...] | status | revoke')
  process.exitCode = 1
}

async function enableMadDb(root: string, args: string[]) {
  const json = hasFlag(args, '--json')
  const ack = readOption(args, '--ack', '')
  if (ack !== MAD_DB_ACK) {
    const result = { schema: 'sks.mad-db-command.v1', ok: false, action: 'enable', reason: 'ack_phrase_required', required_ack: MAD_DB_ACK }
    if (json) return console.log(JSON.stringify(result, null, 2))
    console.error(`Mad-DB enable blocked. Required --ack ${JSON.stringify(MAD_DB_ACK)}`)
    process.exitCode = 2
    return result
  }
  const requestedMission = readOption(args, '--mission', 'latest')
  let missionId = requestedMission === 'new' ? null : await resolveMadDbMissionId(root, {}, requestedMission)
  if (!missionId) {
    const created = await createMission(root, { mode: 'mad-db', prompt: 'sks mad-db enable one-cycle DB break-glass' })
    missionId = created.id
  }
  const capability = await createMadDbCapability(root, {
    missionId,
    ack,
    cwd: process.cwd(),
    ttlMs: Number(readOption(args, '--ttl-ms', String(2 * 60 * 60 * 1000)))
  })
  await setCurrent(root, {
    mission_id: missionId,
    route: 'MadDB',
    route_command: '$MAD-DB',
    mode: 'MADDB',
    phase: 'MADDB_ONE_CYCLE_CAPABILITY_ACTIVE',
    mad_db_active: true,
    mad_db_cycle_id: capability.cycle_id,
    mad_db_capability_file: 'mad-db-capability.json',
    mad_db_ack_phrase: 'accepted',
    stop_gate: 'mad-db-capability.json'
  })
  const result = { schema: 'sks.mad-db-command.v1', ok: true, action: 'enable', mission_id: missionId, capability }
  if (json) return console.log(JSON.stringify(result, null, 2))
  console.log(`Mad-DB one-cycle capability active for ${missionId}; expires ${capability.expires_at}.`)
  return result
}

async function statusMadDb(root: string, args: string[]) {
  const json = hasFlag(args, '--json')
  const missionId = await resolveMadDbMissionId(root, {}, readOption(args, '--mission', 'latest'))
  const capability = missionId ? await readMadDbCapability(root, missionId) : null
  const result = {
    schema: 'sks.mad-db-command.v1',
    ok: true,
    action: 'status',
    mission_id: missionId,
    active: isMadDbCapabilityActive(capability),
    capability
  }
  if (json) return console.log(JSON.stringify(result, null, 2))
  if (!missionId || !capability) console.log('Mad-DB: no capability found.')
  else console.log(`Mad-DB: ${result.active ? 'active' : 'inactive'} for ${missionId}; consumed=${capability.consumed}; expires=${capability.expires_at}.`)
  return result
}

async function revokeMadDb(root: string, args: string[]) {
  const json = hasFlag(args, '--json')
  const missionId = await resolveMadDbMissionId(root, {}, readOption(args, '--mission', 'latest')) || await findLatestMission(root)
  const revoked = missionId ? await revokeMadDbCapability(root, missionId, readOption(args, '--reason', 'operator_revoked')) : null
  await setCurrent(root, { mad_db_active: false, phase: 'MADDB_REVOKED' })
  const result = { schema: 'sks.mad-db-command.v1', ok: Boolean(revoked), action: 'revoke', mission_id: missionId, capability: revoked }
  if (json) return console.log(JSON.stringify(result, null, 2))
  if (!revoked) console.log('Mad-DB: no capability to revoke.')
  else console.log(`Mad-DB capability revoked for ${missionId}.`)
  return result
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag)
}

function readOption(args: string[], name: string, fallback: string) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return String(args[index + 1])
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='))
  return prefixed ? prefixed.slice(name.length + 1) : fallback
}

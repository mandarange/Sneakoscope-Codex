import path from 'node:path'
import { nowIso, sksRoot, writeJsonAtomic } from '../fsx.js'
import { findLatestMission } from '../mission.js'
import { narutoCommand } from './naruto-command.js'
import { teamLegacyObserveCommand, teamLegacySubcommands } from './team-legacy-observe-command.js'

export async function team(args: any = []) {
  if (teamLegacySubcommands.has(String(args[0] || ''))) {
    return teamLegacyObserveCommand(String(args[0]), args.slice(1))
  }
  return redirectTeamCreateToNaruto(args)
}

async function redirectTeamCreateToNaruto(args: any[] = []) {
  const root = await sksRoot()
  const list = (args || []).map((arg: any) => String(arg))
  const narutoArgs = list[0] === 'run' ? list : ['run', ...list]
  console.warn('SKS Team is deprecated for new execution missions; redirecting to $Naruto.')
  const result: any = await narutoCommand(narutoArgs)
  const missionId = result?.mission_id || await findLatestMission(root)
  if (missionId) {
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'missions', missionId, 'team-alias-to-naruto.json'), {
      schema: 'sks.team-alias-to-naruto.v1',
      ok: true,
      mission_id: missionId,
      source_command: 'sks team',
      redirected_to: 'sks naruto run',
      route_command: '$Naruto',
      deprecated_route: '$Team',
      parallel_write_policy: result?.parallel_write_policy || result?.run?.parallel_write_policy || null,
      created_at: nowIso(),
      args: list
    })
  }
  return result
}

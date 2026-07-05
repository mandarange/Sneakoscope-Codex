import path from 'node:path'
import { nowIso, readJson, sksRoot, writeJsonAtomic } from '../fsx.js'
import { findLatestMission } from '../mission.js'
import { narutoCommand } from './naruto-command.js'
import { teamLegacyObserveCommand, teamLegacySubcommands } from './team-legacy-observe-command.js'
import { SSOT_GUARD_ARTIFACT } from '../safety/ssot-guard.js'

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
  const jsonRequested = list.includes('--json')
  console.warn('SKS Team is deprecated for new execution missions; redirecting to $Naruto.')
  const result: any = jsonRequested
    ? await withSuppressedConsoleLog(() => narutoCommand(narutoArgs))
    : await narutoCommand(narutoArgs)
  const missionId = result?.mission_id || await findLatestMission(root, { mode: 'naruto' })
  const nativeAgentRun = missionId ? await buildTeamNativeAgentCompatibility(root, missionId, result) : null
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
      ssot_guard_artifact: SSOT_GUARD_ARTIFACT,
      created_at: nowIso(),
      args: list
    })
  }
  const finalResult = {
    ...result,
    mock: result?.mock === true || result?.backend === 'fake',
    ...(nativeAgentRun ? { native_agent_run: nativeAgentRun } : {})
  }
  if (jsonRequested) console.log(JSON.stringify(finalResult, null, 2))
  return finalResult
}

async function withSuppressedConsoleLog<T>(fn: () => Promise<T>) {
  const originalLog = console.log
  console.log = () => undefined
  try {
    return await fn()
  } finally {
    console.log = originalLog
  }
}

async function buildTeamNativeAgentCompatibility(root: string, missionId: string, result: any) {
  const ledgerRoot = path.join(root, '.sneakoscope', 'missions', missionId, 'agents')
  const [schedulerState, proof, parallelWritePolicy] = await Promise.all([
    readJson<any>(path.join(ledgerRoot, 'agent-scheduler-state.json'), null),
    readJson<any>(path.join(ledgerRoot, 'agent-proof-evidence.json'), null),
    readJson<any>(path.join(ledgerRoot, 'agent-parallel-write-policy.json'), null)
  ])
  if (!schedulerState || !proof) return null
  return {
    schema: result?.run?.schema || 'sks.agent-run.v1',
    ok: result?.run?.ok === true || result?.ok === true,
    mission_id: missionId,
    route: '$Team',
    backend: result?.backend || result?.run?.backend || proof.backend || null,
    ledger_root: path.relative(root, ledgerRoot),
    target_active_slots: schedulerState.target_active_slots ?? result?.target_active_slots ?? null,
    scheduler: {
      state: schedulerState
    },
    proof: {
      ...proof,
      route: '$Team',
      route_command: 'sks team',
      route_blackbox_kind: 'actual_team_command',
      real_route_command_used: true
    },
    parallel_write_policy: parallelWritePolicy || result?.parallel_write_policy || result?.run?.parallel_write_policy || null,
    redirected_to: '$Naruto',
    compatibility: {
      schema: 'sks.team-native-agent-compatibility.v1',
      ok: true,
      source: 'team-alias-to-naruto',
      ledger_root: path.relative(root, ledgerRoot)
    }
  }
}

#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { madHighCommand, resolveMadLaunchMadDbGrant } from '../core/commands/mad-sks-command.js'
import { checkDbOperation } from '../core/db-safety.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const original = {
  cwd: process.cwd(),
  home: process.env.HOME,
  codexHome: process.env.CODEX_HOME,
  noAttach: process.env.SKS_NO_ZELLIJ_ATTACH,
  requireZellij: process.env.SKS_REQUIRE_ZELLIJ,
  madSwarm: process.env.SKS_MAD_NATIVE_SWARM,
  skipNpm: process.env.SKS_SKIP_NPM_FRESHNESS_CHECK,
  updateNotice: process.env.SKS_DISABLE_UPDATE_NOTICE,
  madHeadless: process.env.SKS_MAD_ALLOW_HEADLESS,
  exitCode: process.exitCode
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-mad-command-'))
const home = path.join(tmp, 'home')
const codexHome = path.join(home, '.codex')
const projectCodexDir = path.join(tmp, '.codex')
const configText = [
  'service_tier = "fast"',
  '[features]',
  'fast_mode = true',
  ''
].join('\n')

try {
  await fs.mkdir(codexHome, { recursive: true })
  await fs.mkdir(projectCodexDir, { recursive: true })
  await fs.mkdir(path.join(tmp, '.sneakoscope'), { recursive: true })
  await fs.writeFile(path.join(codexHome, 'config.toml'), configText)
  await fs.writeFile(path.join(projectCodexDir, 'config.toml'), configText)

  process.chdir(tmp)
  process.env.HOME = home
  process.env.CODEX_HOME = codexHome
  process.env.SKS_NO_ZELLIJ_ATTACH = '1'
  process.env.SKS_REQUIRE_ZELLIJ = '0'
  process.env.SKS_MAD_NATIVE_SWARM = '0'
  process.env.SKS_SKIP_NPM_FRESHNESS_CHECK = '1'
  process.env.SKS_DISABLE_UPDATE_NOTICE = '1'
  process.env.SKS_MAD_ALLOW_HEADLESS = '1'
  process.exitCode = 0

  const launch = await madHighCommand(['--headless', '--skip-zellij-repair', '--no-attach', '--no-swarm'], {
    maybePromptSksUpdateForLaunch: async () => ({ status: 'skipped' }),
    maybePromptCodexUpdateForLaunch: async () => ({ status: 'skipped' }),
    ensureMadLaunchDependencies: async () => ({ ready: true, actions: [] }),
    maybePromptCodexLbSetupForLaunch: async () => ({ status: 'skipped' })
  })
  assertGate(launch?.ok === true && launch.status === 'headless-fallback', 'sks --mad fixture launch must complete headless', launch)

  const state = await readJson(path.join(tmp, '.sneakoscope', 'state', 'current.json'))
  assert.equal(state.mad_sks_active, true)
  assert.notEqual(state.mad_db_active, true)
  assert.notEqual(state.mad_db_grant_source, 'sks_mad_default')
  assert.notEqual(state.mad_db_priority_override_active, true)

  const missionDir = path.join(tmp, '.sneakoscope', 'missions', state.mission_id)
  await assertMissing(path.join(missionDir, 'mad-db-capability.json'), 'bare sks --mad must not create a MadDB capability')
  await assertMissing(path.join(missionDir, 'mad-sks-launch-grants.json'), 'bare sks --mad must not create MadDB grant artifacts')

  const decision: any = await checkDbOperation(tmp, state, {
    tool_name: 'supabase.execute_sql',
    tool_call_id: 'mad-sks-default-does-not-open-maddb',
    sql: 'truncate sks_mad_db_probe;'
  })
  assertGate(decision.allowed === false && decision.mad_db?.active !== true, 'sks --mad default must not satisfy MadDB mutation policy locally', decision)

  const defaultGrant = resolveMadLaunchMadDbGrant([])
  const explicitGrant = resolveMadLaunchMadDbGrant(['--mad-db'])
  assert.equal(defaultGrant.enabled, false)
  assert.equal(defaultGrant.requested, false)
  assert.equal(explicitGrant.enabled, false)
  assert.equal(explicitGrant.requested, true)
  assert.equal(explicitGrant.source, 'mad_db_first_class_route_required')

  emitGate('mad-db:mad-command', {
    mission_id: state.mission_id,
    default_mad_db_active: state.mad_db_active === true,
    explicit_flag_source: explicitGrant.source
  })
} finally {
  process.chdir(original.cwd)
  restoreEnv('HOME', original.home)
  restoreEnv('CODEX_HOME', original.codexHome)
  restoreEnv('SKS_NO_ZELLIJ_ATTACH', original.noAttach)
  restoreEnv('SKS_REQUIRE_ZELLIJ', original.requireZellij)
  restoreEnv('SKS_MAD_NATIVE_SWARM', original.madSwarm)
  restoreEnv('SKS_SKIP_NPM_FRESHNESS_CHECK', original.skipNpm)
  restoreEnv('SKS_DISABLE_UPDATE_NOTICE', original.updateNotice)
  restoreEnv('SKS_MAD_ALLOW_HEADLESS', original.madHeadless)
  process.exitCode = original.exitCode
}

async function readJson(file: string) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function assertMissing(file: string, message: string) {
  try {
    await fs.access(file)
    assertGate(false, message, { file })
  } catch (err: any) {
    if (err?.code === 'ENOENT') return
    throw err
  }
}

function restoreEnv(key: string, value: string | undefined) {
  if (value == null) delete process.env[key]
  else process.env[key] = value
}

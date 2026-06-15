#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { madHighCommand } from '../core/commands/mad-sks-command.js'
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
  assert.equal(state.mad_db_active, true)
  assert.equal(state.mad_db_grant_source, 'sks_mad_default')
  assert.equal(state.mad_db_priority_override_active, true)

  const missionDir = path.join(tmp, '.sneakoscope', 'missions', state.mission_id)
  const grants = await readJson(path.join(missionDir, 'mad-sks-launch-grants.json'))
  const capability = await readJson(path.join(missionDir, 'mad-db-capability.json'))
  assert.equal(grants.mad_sks_active, true)
  assert.equal(grants.mad_db_active, true)
  assert.equal(grants.mad_db_default_grant, true)
  assert.equal(capability.enabled, true)
  assert.equal(capability.one_cycle_only, true)
  assert.equal(capability.consumed, false)

  const decision: any = await checkDbOperation(tmp, state, {
    tool_name: 'supabase.execute_sql',
    sql: "insert into sks_mad_db_probe(message) values ('default grant proof');"
  })
  assertGate(decision.allowed === true && decision.mad_db?.active === true, 'sks --mad default MAD-DB grant must satisfy DB mutation policy locally', decision)

  emitGate('mad-db:mad-command', {
    mission_id: state.mission_id,
    grant_source: state.mad_db_grant_source,
    cycle_id: capability.cycle_id
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

function restoreEnv(key: string, value: string | undefined) {
  if (value == null) delete process.env[key]
  else process.env[key] = value
}

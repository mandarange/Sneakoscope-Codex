import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { dispatch } from '../../../cli/router.js'
import { fixPathCommand, setupCommand } from '../basic-cli.js'
import { run as doctorRun } from '../../../commands/doctor.js'
import { MANAGED_OFFICIAL_SUBAGENT_ROLES } from '../../managed-assets/managed-assets-manifest.js'

async function withTempProject(prefix: string, fn: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  const oldCwd = process.cwd()
  const oldHome = process.env.HOME
  const oldCodexHome = process.env.CODEX_HOME
  const oldExitCode = process.exitCode
  const oldLog = console.log
  const oldError = console.error
  try {
    await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture","private":true}\n')
    process.chdir(root)
    process.env.HOME = path.join(root, 'home')
    process.env.CODEX_HOME = path.join(root, 'home', '.codex')
    process.exitCode = undefined
    console.log = () => undefined
    console.error = () => undefined
    await fn(root)
  } finally {
    process.chdir(oldCwd)
    if (oldHome === undefined) delete process.env.HOME
    else process.env.HOME = oldHome
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = oldCodexHome
    process.exitCode = oldExitCode
    console.log = oldLog
    console.error = oldError
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('setup quarantines OMX before creating SKS files', async () => {
  await withTempProject('sks-setup-conflict-', async (root) => {
    await fs.mkdir(path.join(root, '.omx'))
    const result: any = await setupCommand(['--local-only', '--skip-cli-tools', '--json'])
    assert.equal(result.ok, true)
    assert.notEqual(result.status, 'blocked_harness_conflict')
    await assert.rejects(fs.access(path.join(root, '.omx')))
    await fs.access(path.join(root, '.sneakoscope'))
    assert.ok(result.other_harness_cleanup?.cleaned?.length >= 1)
  })
})

test('setup dispatch quarantines OMX before first-command migration write', async () => {
  await withTempProject('sks-setup-dispatch-conflict-', async (root) => {
    const oldGlobalRoot = process.env.SKS_GLOBAL_ROOT
    const oldRequireReceipt = process.env.SKS_REQUIRE_UPDATE_MIGRATION_RECEIPT
    const oldGateDisabled = process.env.SKS_UPDATE_MIGRATION_GATE_DISABLED
    const globalRoot = path.join(root, 'global-sks')
    try {
      process.env.SKS_GLOBAL_ROOT = globalRoot
      process.env.SKS_REQUIRE_UPDATE_MIGRATION_RECEIPT = '1'
      delete process.env.SKS_UPDATE_MIGRATION_GATE_DISABLED
      await fs.mkdir(path.join(root, '.omx'))

      const result: any = await dispatch(['setup', '--local-only', '--skip-cli-tools', '--json'])
      assert.equal(result.ok, true)
      assert.notEqual(result.status, 'blocked_harness_conflict')
      await assert.rejects(fs.access(path.join(root, '.omx')))
      await fs.access(path.join(root, '.sneakoscope'))
    } finally {
      restoreEnv('SKS_GLOBAL_ROOT', oldGlobalRoot)
      restoreEnv('SKS_REQUIRE_UPDATE_MIGRATION_RECEIPT', oldRequireReceipt)
      restoreEnv('SKS_UPDATE_MIGRATION_GATE_DISABLED', oldGateDisabled)
    }
  })
})

test('doctor --fix quarantines DCodex before repair writes', async () => {
  await withTempProject('sks-doctor-conflict-', async (root) => {
    await fs.mkdir(path.join(root, '.dcodex'))
    await doctorRun('doctor', ['--fix', '--json'])
    await assert.rejects(fs.access(path.join(root, '.dcodex')))
  })
})

test('setup strips OMX markers from the active custom CODEX_HOME before writes', async () => {
  await withTempProject('sks-setup-custom-codex-home-conflict-', async (root) => {
    const customCodexHome = path.join(root, 'custom-codex-home')
    process.env.CODEX_HOME = customCodexHome
    await fs.mkdir(customCodexHome, { recursive: true })
    await fs.writeFile(path.join(customCodexHome, 'config.toml'), '[harness]\nname = "omx"\nmodel = "keep-me"\n')

    const result: any = await setupCommand(['--local-only', '--skip-cli-tools', '--json'])
    assert.equal(result.ok, true)
    assert.notEqual(result.status, 'blocked_harness_conflict')
    const config = await fs.readFile(path.join(customCodexHome, 'config.toml'), 'utf8')
    assert.doesNotMatch(config, /omx/i)
    assert.match(config, /keep-me/)
    await fs.access(path.join(root, '.sneakoscope'))
  })
})

test('doctor --fix strips DCodex markers from the active custom CODEX_HOME before writes', async () => {
  await withTempProject('sks-doctor-custom-codex-home-conflict-', async (root) => {
    const customCodexHome = path.join(root, 'custom-codex-home')
    process.env.CODEX_HOME = customCodexHome
    await fs.mkdir(customCodexHome, { recursive: true })
    await fs.writeFile(path.join(customCodexHome, 'config.toml'), '[harness]\nname = "dcodex"\nmodel = "keep-me"\n')

    await doctorRun('doctor', ['--fix', '--json'])
    const config = await fs.readFile(path.join(customCodexHome, 'config.toml'), 'utf8')
    assert.doesNotMatch(config, /dcodex/i)
    assert.match(config, /keep-me/)
  })
})

test('setup preserves a user worker TOML and reports the collision as failure', async () => {
  await withTempProject('sks-setup-user-agent-', async (root) => {
    const agentsDir = path.join(root, '.codex', 'agents')
    await fs.mkdir(agentsDir, { recursive: true })
    const workerPath = path.join(agentsDir, 'worker.toml')
    const customWorker = 'name = "worker"\ndescription = "my user worker"\n'
    await fs.writeFile(workerPath, customWorker)

    const result: any = await setupCommand([
      '--local-only',
      '--install-scope', 'project',
      '--skip-cli-tools',
      '--json'
    ])
    assert.equal(result.ok, false)
    assert.equal(result.status, 'manual_blocked')
    assert.ok(result.blockers.includes('manual_user_owned_official_subagent_collision:.codex/agents/worker.toml'))
    assert.equal(await fs.readFile(workerPath, 'utf8'), customWorker)
    await fs.access(path.join(agentsDir, 'expert.toml'))
  })
})

test('setup preserves invalid inherited global TOML and returns a manual blocker', async () => {
  await withTempProject('sks-setup-invalid-global-config-', async (root) => {
    const globalConfigPath = path.join(String(process.env.CODEX_HOME), 'config.toml')
    const projectConfigPath = path.join(root, '.codex', 'config.toml')
    const invalidGlobal = '[agents\nmax_threads = 20\n'
    await fs.mkdir(path.dirname(globalConfigPath), { recursive: true })
    await fs.writeFile(globalConfigPath, invalidGlobal)

    const result: any = await setupCommand([
      '--local-only',
      '--install-scope', 'project',
      '--skip-cli-tools',
      '--json'
    ])
    assert.equal(result.ok, false)
    assert.equal(result.status, 'manual_blocked')
    assert.ok(result.blockers.includes('manual_invalid_inherited_global_codex_config'))
    assert.equal(await fs.readFile(globalConfigPath, 'utf8'), invalidGlobal)
    const backup = (await fs.readdir(path.dirname(globalConfigPath)))
      .find((name) => name.startsWith('config.toml.sks-inherited-global-config-invalid-') && name.endsWith('.bak'))
    assert.ok(backup)
    assert.equal(await fs.readFile(path.join(path.dirname(globalConfigPath), String(backup)), 'utf8'), invalidGlobal)
    await assert.rejects(fs.access(projectConfigPath))
  })
})

test('setup reports a failed authoritative global skill install instead of completed', async () => {
  await withTempProject('sks-setup-global-skill-blocked-', async (root) => {
    const home = String(process.env.HOME)
    await fs.mkdir(home, { recursive: true })
    await fs.writeFile(path.join(home, '.agents'), 'user-owned non-directory collision\n')

    const result: any = await setupCommand([
      '--local-only',
      '--install-scope', 'project',
      '--skip-cli-tools',
      '--json'
    ])

    assert.equal(result.ok, false)
    assert.equal(result.status, 'skill_blocked')
    assert.equal(result.skill_install.ok, false)
    assert.ok(result.blockers.includes('authoritative_sks_skill_install_failed'))
    assert.ok(result.blockers.some((item: string) => item.startsWith('skill_install:')))
  })
})

test('fix-path reports a failed authoritative global skill install instead of success', async () => {
  await withTempProject('sks-fix-path-global-skill-blocked-', async () => {
    const home = String(process.env.HOME)
    await fs.mkdir(home, { recursive: true })
    await fs.writeFile(path.join(home, '.agents'), 'user-owned non-directory collision\n')

    const result: any = await fixPathCommand([
      '--local-only',
      '--install-scope', 'project',
      '--json'
    ])

    assert.equal(result.ok, false)
    assert.equal(result.status, 'skill_blocked')
    assert.equal(result.skill_install.ok, false)
    assert.ok(result.blockers.includes('authoritative_sks_skill_install_failed'))
    assert.ok(result.blockers.some((item: string) => item.startsWith('skill_install:')))
    assert.equal(process.exitCode, 1)
  })
})

test('doctor --fix run from HOME does not remove the authoritative global skill install', async () => {
  await withTempProject('sks-doctor-home-skill-root-', async (root) => {
    process.env.HOME = root
    process.env.CODEX_HOME = path.join(root, '.codex')

    await doctorRun('doctor', ['--fix', '--yes', '--local-only', '--machine-only', '--profile', 'fix', '--json'])

    const naruto = await fs.readFile(path.join(root, '.agents', 'skills', 'sks-naruto', 'SKILL.md'), 'utf8')
    assert.match(naruto, /BEGIN SKS IMMUTABLE CORE SKILL/)
  })
})

test('default doctor fix creates the project-scoped official custom agent catalog', async () => {
  await withTempProject('sks-doctor-official-roles-', async (root) => {
    const codexHome = String(process.env.CODEX_HOME)
    const globalAgents = path.join(codexHome, 'agents')
    await fs.mkdir(globalAgents, { recursive: true })
    const userRole = path.join(globalAgents, 'user-role.toml')
    await fs.writeFile(userRole, 'name = "user-role"\n')

    await doctorRun('doctor', ['--fix', '--yes', '--local-only', '--machine-only', '--profile', 'fix', '--json'])

    const projectFiles = (await fs.readdir(path.join(root, '.codex', 'agents'))).sort()
    const globalFiles = (await fs.readdir(globalAgents)).sort()
    assert.deepEqual(projectFiles, MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.filename).sort())
    assert.deepEqual(globalFiles, ['user-role.toml'])
    assert.equal(await fs.readFile(userRole, 'utf8'), 'name = "user-role"\n')
  })
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

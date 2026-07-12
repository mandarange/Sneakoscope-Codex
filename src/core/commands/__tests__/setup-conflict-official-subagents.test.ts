import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setupCommand } from '../basic-cli.js'
import { run as doctorRun } from '../../../commands/doctor.js'

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

test('setup conflict-blocks OMX before creating SKS files', async () => {
  await withTempProject('sks-setup-conflict-', async (root) => {
    await fs.mkdir(path.join(root, '.omx'))
    const result: any = await setupCommand(['--local-only', '--skip-cli-tools', '--json'])
    assert.equal(result.ok, false)
    assert.equal(result.status, 'blocked_harness_conflict')
    assert.equal(result.cleanup_prompt_command, 'sks conflicts prompt')
    await assert.rejects(fs.access(path.join(root, '.sneakoscope')))
  })
})

test('doctor --fix conflict-blocks DCodex before repair writes', async () => {
  await withTempProject('sks-doctor-conflict-', async (root) => {
    await fs.mkdir(path.join(root, '.dcodex'))
    const result: any = await doctorRun('doctor', ['--fix', '--json'])
    assert.equal(result.ok, false)
    assert.equal(result.status, 'blocked_harness_conflict')
    assert.equal(result.no_fix_writes_performed, true)
    await assert.rejects(fs.access(path.join(root, '.sneakoscope')))
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

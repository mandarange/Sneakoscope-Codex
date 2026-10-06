import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  narutoExecutionPath,
  narutoUsesCurrentSession,
  readNarutoExecutionMode,
  writeNarutoExecutionMode
} from '../naruto-execution-mode.js'
import { configureNarutoExecution } from '../../commands/naruto-config-command.js'

function testEnv(root: string): NodeJS.ProcessEnv {
  return { HOME: root, SKS_HOME: path.join(root, '.sneakoscope'), CODEX_THREAD_ID: 'thread-from-shell' }
}

test('Naruto execution preference is safe, idempotent, and preserves explicit choices across update seeding', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-execution-'))
  const env = testEnv(root)
  try {
    assert.equal(readNarutoExecutionMode(env).mode, 'auto')
    assert.equal(readNarutoExecutionMode(env).stored, false)
    const seeded = await writeNarutoExecutionMode('standalone', env, true)
    assert.equal(seeded.changed, true)
    assert.equal(narutoUsesCurrentSession(env), false)
    const selected = await writeNarutoExecutionMode('current-session', env)
    assert.equal(selected.mode, 'current-session')
    assert.equal(narutoUsesCurrentSession(env), true)
    const preserved = await writeNarutoExecutionMode('standalone', env, true)
    assert.equal(preserved.changed, false)
    assert.equal(preserved.mode, 'current-session')
    assert.equal(narutoUsesCurrentSession({ ...env, SKS_NARUTO_APP_SESSION: '1' }), true)
    assert.equal(narutoUsesCurrentSession({ ...env, SKS_NARUTO_STANDALONE_CLI: '1' }), false)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('Naruto execution preference rejects malformed and symlinked files before writing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-execution-safety-'))
  const env = testEnv(root)
  try {
    const file = narutoExecutionPath(env)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{"schema":"wrong","mode":"standalone"}\n')
    assert.equal(readNarutoExecutionMode(env).blockers[0], 'naruto_execution_preference_unreadable')
    await assert.rejects(writeNarutoExecutionMode('auto', env), /naruto_execution_preference_unreadable/)
    const outside = path.join(root, 'outside.json')
    await fs.writeFile(outside, '{"schema":"sks.naruto-execution.v1","mode":"standalone"}\n')
    await fs.unlink(file)
    await fs.symlink(outside, file)
    await assert.rejects(writeNarutoExecutionMode('current-session', env), /naruto_execution_preference_unsafe_path/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('Naruto execution Apply reports the guarded Codex App restart outcome', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-execution-apply-'))
  const env = testEnv(root)
  try {
    const result = await configureNarutoExecution({
      mode: 'current-session',
      restart: true,
      env,
      restartOptions: {
        platform: 'darwin',
        isRunningImpl: async () => true,
        restartImpl: async () => ({ schema: 'sks.codex-app-restart.v1', ok: true, status: 'restarted', app_name: 'Codex', blockers: [] })
      }
    })
    assert.equal(result.ok, true)
    assert.equal(result.mode, 'current-session')
    assert.equal(result.restart?.status, 'restarted')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

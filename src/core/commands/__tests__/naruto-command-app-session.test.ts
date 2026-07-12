import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createMission, loadStateForSession } from '../../mission.js'
import { narutoCommand } from '../naruto-command.js'

test('App Naruto reuses the active mission bound to the current Codex thread state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-app-session-'))
  const threadId = 'thread-app-session-regression'
  const oldCwd = process.cwd()
  const oldThreadId = process.env.CODEX_THREAD_ID
  const oldAppSession = process.env.SKS_NARUTO_APP_SESSION
  const oldStandalone = process.env.SKS_NARUTO_STANDALONE_CLI
  const oldHome = process.env.HOME
  const oldCodexHome = process.env.CODEX_HOME
  const oldLog = console.log
  const oldWarn = console.warn
  try {
    const previous = await createMission(root, { mode: 'naruto', prompt: 'old mission', sessionKey: threadId })
    process.chdir(root)
    process.env.CODEX_THREAD_ID = threadId
    delete process.env.SKS_NARUTO_APP_SESSION
    delete process.env.SKS_NARUTO_STANDALONE_CLI
    process.env.HOME = path.join(root, 'home')
    process.env.CODEX_HOME = path.join(root, 'home', '.codex')
    console.log = () => undefined
    console.warn = () => undefined

    const result: any = await narutoCommand(['run', 'review independent packages', '--agents', '2', '--json'])
    const sessionState: any = await loadStateForSession(root, threadId)

    assert.equal(result.mission_id, previous.id)
    assert.equal(result.ok, false)
    assert.equal(result.status, 'delegation_context_ready')
    assert.equal(result.session_scope, threadId)
    assert.equal(sessionState.mission_id, result.mission_id)
    assert.equal(sessionState.subagents_required, true)
    assert.equal(sessionState.phase, 'NARUTO_DELEGATION_CONTEXT_READY')
  } finally {
    process.chdir(oldCwd)
    restoreEnv('CODEX_THREAD_ID', oldThreadId)
    restoreEnv('SKS_NARUTO_APP_SESSION', oldAppSession)
    restoreEnv('SKS_NARUTO_STANDALONE_CLI', oldStandalone)
    restoreEnv('HOME', oldHome)
    restoreEnv('CODEX_HOME', oldCodexHome)
    console.log = oldLog
    console.warn = oldWarn
    await fs.rm(root, { recursive: true, force: true })
  }
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

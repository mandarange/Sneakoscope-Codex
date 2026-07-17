import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { runProcess } from '../fsx.js'

test('runProcess completes spawn registration before a POSIX child continues', { skip: process.platform === 'win32' }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-run-process-spawn-'))
  const registration = path.join(root, 'registered')
  t.after(async () => fsp.rm(root, { recursive: true, force: true }))

  const result = await runProcess(process.execPath, [
    '-e',
    "const fs=require('node:fs'); process.exit(fs.existsSync(process.argv[1]) ? 0 : 7)",
    registration
  ], {
    timeoutMs: 5_000,
    onSpawn: async (pid) => {
      assert.ok(pid > 0)
      await new Promise((resolve) => setTimeout(resolve, 50))
      await fsp.writeFile(registration, 'ready\n')
    }
  })

  assert.equal(result.code, 0)
  assert.equal(result.spawnRegistrationFailed, undefined)
})

test('runProcess kills the child and fails closed when spawn registration fails', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    timeoutMs: 5_000,
    onSpawn: async () => {
      throw new Error('fixture registration failure')
    }
  })

  assert.notEqual(result.code, 0)
  assert.equal(result.spawnRegistrationFailed, true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { agentCommand } from '../../commands/agent-command.js'

test('agent --help is read-only and cannot create a native mission', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-help-'))
  const previous = process.cwd()
  try {
    process.chdir(root)
    const result = await agentCommand(['--help', '--json']) as any
    assert.equal(result.ok, true)
    assert.equal(result.action, 'help')
    assert.equal(result.read_only, true)
    await assert.rejects(fs.access(path.join(root, '.sneakoscope', 'missions')))
  } finally {
    process.chdir(previous)
    await fs.rm(root, { recursive: true, force: true })
  }
})

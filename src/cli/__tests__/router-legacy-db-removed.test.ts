import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatch, normalizeCommand } from '../router.js'
import { usageCommand } from '../../core/commands/basic-cli.js'

test('legacy sks db is absent from normalization and returns unknown_command', async () => {
  assert.equal(normalizeCommand(['db', 'check']).command, null)

  const stdout: string[] = []
  const stderr: string[] = []
  const previousLog = console.log
  const previousError = console.error
  const previousExitCode = process.exitCode
  try {
    console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '))
    console.error = (...args: unknown[]) => stderr.push(args.map(String).join(' '))
    process.exitCode = undefined
    const result: any = await dispatch(['db', 'check', '--json'])
    assert.equal(result.ok, false)
    assert.equal(result.status, 'blocked')
    assert.equal(result.command, 'db')
    assert.equal(result.reason, 'unknown_command')
    assert.equal(process.exitCode, 1)
    assert.match(stdout.join('\n'), /"reason": "unknown_command"/)
    assert.match(stderr.join('\n'), /Unknown command: db/)
  } finally {
    console.log = previousLog
    console.error = previousError
    process.exitCode = previousExitCode
  }
})

test('legacy db is not exposed as a public usage topic', () => {
  const stdout: string[] = []
  const previousLog = console.log
  try {
    console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '))
    usageCommand(['db'])
    assert.match(stdout.join('\n'), /Unknown usage topic: db/)
    assert.doesNotMatch(stdout.join('\n'), /^\$DB$/m)
  } finally {
    console.log = previousLog
  }
})

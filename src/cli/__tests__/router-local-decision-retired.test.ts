import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatch, normalizeCommand } from '../router.js'
import { COMMAND_MANIFEST_BY_NAME } from '../command-manifest-lite.js'

test('sks local-decision is not a command', async () => {
  assert.equal(normalizeCommand(['local-decision', 'status']).command, null)
  assert.equal('local-decision' in COMMAND_MANIFEST_BY_NAME, false)

  const stdout: string[] = []
  const stderr: string[] = []
  const previousLog = console.log
  const previousError = console.error
  const previousExitCode = process.exitCode
  try {
    console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '))
    console.error = (...args: unknown[]) => stderr.push(args.map(String).join(' '))
    process.exitCode = undefined
    const result: any = await dispatch(['local-decision', 'status', '--json'])

    assert.equal(result.ok, false)
    assert.equal(result.status, 'blocked')
    assert.equal(result.command, 'local-decision')
    assert.equal(result.reason, 'unknown_command')
    assert.equal(result.replacement, undefined)
    assert.equal(process.exitCode, 1)
    assert.match(stdout.join('\n'), /"reason": "unknown_command"/)
    assert.match(stderr.join('\n'), /Unknown command: local-decision/)
    assert.doesNotMatch(stdout.join('\n') + stderr.join('\n'), /Qwen|MLX|local_feature_retired/)
  } finally {
    console.log = previousLog
    console.error = previousError
    process.exitCode = previousExitCode
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { narutoCommand } from '../naruto-command.js'

test('normal Naruto blocks command-local GLM before any provider delegation', async () => {
  const previousExitCode = process.exitCode
  const previousLog = console.log
  const output: string[] = []
  console.log = (...args: unknown[]) => output.push(args.map(String).join(' '))
  try {
    process.exitCode = undefined
    const result: any = await narutoCommand(['--glm', '--json'])
    assert.equal(process.exitCode, 1)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'naruto_gpt_5_6_family_only_glm_override_forbidden')
    assert.deepEqual(result.blockers, ['naruto_gpt_5_6_family_only_glm_override_forbidden'])
    assert.match(output.join('\n'), /naruto_gpt_5_6_family_only_glm_override_forbidden/)
  } finally {
    console.log = previousLog
    process.exitCode = previousExitCode
  }
})

test('real write-capable Naruto fails closed when no source target path is named', async () => {
  const previousExitCode = process.exitCode
  const previousLog = console.log
  const output: string[] = []
  console.log = (...args: unknown[]) => output.push(args.map(String).join(' '))
  try {
    process.exitCode = undefined
    const result: any = await narutoCommand(['run', 'implement the feature', '--backend', 'codex-sdk', '--json', '--no-open-zellij'])
    assert.equal(process.exitCode, 1)
    assert.equal(result.ok, false)
    assert.ok(result.blockers.includes('write_capable_prompt_target_paths_empty'))
    assert.match(result.hint, /target source path/i)
  } finally {
    console.log = previousLog
    process.exitCode = previousExitCode
  }
})

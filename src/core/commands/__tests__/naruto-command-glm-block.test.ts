import test from 'node:test'
import assert from 'node:assert/strict'
import { narutoCommand, parseNarutoArgs } from '../naruto-command.js'
import { buildNarutoHelpResult } from '../../subagents/naruto-help-contract.js'

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

test('Naruto keeps requested official subagent counts and canonical thread flags', () => {
  const parsed = parseNarutoArgs(['run', 'review', 'the', 'packages', '--agents', '12', '--max-threads', '8', '--json'])
  assert.equal(parsed.action, 'run')
  assert.equal(parsed.prompt, 'review the packages')
  assert.equal(parsed.requestedSubagents, 12)
  assert.equal(parsed.maxThreads, 8)
  assert.equal(parsed.clonesAliasUsed, false)
  assert.deepEqual(parsed.unsupportedLegacyFlags, [])
  assert.deepEqual(parsed.argumentErrors, [])
})

test('Naruto parser accepts equals syntax and rejects malformed or empty paid fanout requests', () => {
  const equals = parseNarutoArgs(['run', 'review packages', '--agents=12', '--max-threads=8'])
  assert.equal(equals.requestedSubagents, 12)
  assert.equal(equals.maxThreads, 8)
  assert.deepEqual(equals.argumentErrors, [])

  const missing = parseNarutoArgs(['run', 'review packages', '--agents', '--max-threads=oops'])
  assert.ok(missing.argumentErrors.includes('missing_option_value:--agents'))
  assert.ok(missing.argumentErrors.includes('invalid_positive_integer:--max-threads=oops'))

  const empty = parseNarutoArgs(['run', '--agents=8'])
  assert.ok(empty.argumentErrors.includes('empty_task'))
})

test('Naruto parser fails closed on legacy backend scheduler pool and model options', () => {
  const parsed = parseNarutoArgs([
    'run', 'review packages',
    '--backend=codex-sdk',
    '--scheduler', 'legacy',
    '--pool-size=4',
    '--model', 'gpt-5.6-terra'
  ])
  assert.deepEqual(parsed.unsupportedLegacyFlags, [
    '--backend=codex-sdk',
    '--scheduler=legacy',
    '--pool-size=4',
    '--model=gpt-5.6-terra'
  ])
})

test('direct Naruto help uses the exact shared fast-help JSON contract', async () => {
  const previousLog = console.log
  console.log = () => undefined
  try {
    const result = await narutoCommand(['help', '--json'])
    assert.deepEqual(result, buildNarutoHelpResult())
  } finally {
    console.log = previousLog
  }
})

test('Naruto preserves deprecated aliases for one release without selecting the legacy runtime', () => {
  const parsed = parseNarutoArgs(['workers', 'latest', '--clones', '8'])
  assert.equal(parsed.action, 'subagents')
  assert.equal(parsed.missionId, 'latest')
  assert.equal(parsed.requestedSubagents, 8)
  assert.equal(parsed.workersAliasUsed, true)
  assert.equal(parsed.clonesAliasUsed, true)
})

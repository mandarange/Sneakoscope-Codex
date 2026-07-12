import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNarutoGateResult, narutoCommand, parseNarutoArgs } from '../naruto-command.js'
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

  for (const args of [
    ['--json', 'status', 'latest'],
    ['--agents=8', 'status'],
    ['--max-threads=12', 'proof', 'latest'],
    ['--agents=8', 'run', 'task']
  ]) {
    const misplaced = parseNarutoArgs(args)
    assert.ok(misplaced.argumentErrors.some((error) => error.startsWith('misplaced_subcommand:')), args.join(' '))
  }

  const removedAfterOption = parseNarutoArgs(['--agents=8', 'dashboard'])
  assert.ok(removedAfterOption.argumentErrors.includes('removed_legacy_subcommand:dashboard'))

  for (const flag of ['--json=true', '--read-only=true', '--readonly=false', '--help=true']) {
    const booleanValue = parseNarutoArgs(['run', 'task', flag])
    assert.ok(booleanValue.argumentErrors.some((error) => error.startsWith('boolean_option_value_not_supported:')), flag)
  }
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

test('removed Naruto dashboard command fails closed instead of becoming a paid run task', async () => {
  const parsed = parseNarutoArgs(['dashboard', 'latest'])
  assert.equal(parsed.action, 'run')
  assert.ok(parsed.argumentErrors.includes('removed_legacy_subcommand:dashboard'))

  const previousExitCode = process.exitCode
  const previousError = console.error
  const previousLog = console.log
  console.error = () => undefined
  console.log = () => undefined
  try {
    process.exitCode = undefined
    const result: any = await narutoCommand(['dashboard', 'latest', '--json'])
    assert.equal(process.exitCode, 1)
    assert.equal(result.ok, false)
    assert.ok(result.blockers.includes('invalid_naruto_argument:removed_legacy_subcommand:dashboard'))
  } finally {
    console.error = previousError
    console.log = previousLog
    process.exitCode = previousExitCode
  }
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

test('human Naruto help renders model mapping nesting and durable parent evidence', async () => {
  const previousLog = console.log
  const output: string[] = []
  console.log = (...args: unknown[]) => output.push(args.map(String).join(' '))
  try {
    await narutoCommand(['help'])
    const text = output.join('\n')
    assert.match(text, /Parent: gpt-5\.6-sol \/ max/)
    assert.match(text, /Worker: gpt-5\.6-luna \/ max/)
    assert.match(text, /Expert: gpt-5\.6-sol \/ max/)
    assert.match(text, /max_depth=1/)
    assert.match(text, /subagent-parent-summary\.json/)
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

test('standalone and hook completion share the canonical Naruto gate fields', () => {
  const gate = buildNarutoGateResult({
    missionId: 'M-gate-shape',
    passed: true,
    blockers: [],
    evidence: {
      ok: true,
      requested_subagents: 2,
      started_threads: 2,
      completed_threads: 2,
      failed_threads: 0,
      parent_summary_present: true,
      event_sources: ['SubagentStart', 'SubagentStop'],
      blockers: []
    }
  })
  assert.equal(gate.status, 'passed')
  assert.equal(gate.subagent_plan_ready, true)
  assert.equal(gate.official_subagent_evidence, true)
  assert.equal(gate.session_cleanup, true)
  assert.deepEqual(gate.missing_fields, [])
})

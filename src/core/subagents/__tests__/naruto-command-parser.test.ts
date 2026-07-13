import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNarutoArgs } from '../../commands/naruto-command.js'

test('Naruto parser blocks removed legacy execution options without an escape hatch', () => {
  for (const args of [
    ['run', 'task', '--backend', 'codex-sdk'],
    ['run', 'task', '--scheduler', 'legacy'],
    ['run', 'task', '--pool-size=8'],
    ['run', 'task', '--model', 'gpt-5.6-terra']
  ]) {
    const parsed = parseNarutoArgs(args)
    assert.ok(parsed.unsupportedLegacyFlags.length > 0, args.join(' '))
  }
})

test('Naruto parser rejects missing fanout values, empty tasks, and misplaced subcommands', () => {
  assert.ok(parseNarutoArgs(['run', 'task', '--agents']).argumentErrors.includes('missing_option_value:--agents'))
  assert.ok(parseNarutoArgs(['run', 'task', '--max-threads=']).argumentErrors.includes('missing_option_value:--max-threads'))
  assert.ok(parseNarutoArgs(['run']).argumentErrors.includes('empty_task'))
  assert.ok(parseNarutoArgs(['status', 'run']).argumentErrors.includes('misplaced_subcommand:run'))
  assert.ok(parseNarutoArgs(['run', 'dashboard']).argumentErrors.includes('removed_legacy_subcommand:dashboard'))
})

test('Naruto parser keeps explicit scaling and read-only status surfaces', () => {
  const run = parseNarutoArgs(['run', 'bounded task', '--agents=4', '--max-threads', '8'])
  assert.deepEqual({
    action: run.action,
    prompt: run.prompt,
    requestedSubagents: run.requestedSubagents,
    maxThreads: run.maxThreads,
    errors: run.argumentErrors,
    legacy: run.unsupportedLegacyFlags
  }, {
    action: 'run',
    prompt: 'bounded task',
    requestedSubagents: 4,
    maxThreads: 8,
    errors: [],
    legacy: []
  })
  assert.equal(parseNarutoArgs(['status', 'latest']).action, 'status')
  assert.equal(parseNarutoArgs(['subagents', 'M-123']).action, 'subagents')
  assert.equal(parseNarutoArgs(['proof', 'latest']).action, 'proof')
})

test('Naruto parser accepts top-level and subcommand-local help without positional errors', () => {
  for (const args of [
    ['--help'],
    ['run', '--help'],
    ['run', 'ignored task', '--help'],
    ['status', '--help'],
    ['subagents', '--help'],
    ['proof', '--help']
  ]) {
    const parsed = parseNarutoArgs(args)
    assert.equal(parsed.action, 'help', args.join(' '))
    assert.deepEqual(parsed.argumentErrors, [], args.join(' '))
    assert.deepEqual(parsed.unsupportedLegacyFlags, [], args.join(' '))
  }

  const jsonHelp = parseNarutoArgs(['status', '--help', '--json'])
  assert.equal(jsonHelp.action, 'help')
  assert.equal(jsonHelp.json, true)
})

test('Naruto help does not erase prohibited or malformed options', () => {
  const legacy = parseNarutoArgs(['run', 'task', '--model', 'gpt-5.6-terra', '--help'])
  assert.equal(legacy.action, 'help')
  assert.ok(legacy.unsupportedLegacyFlags.includes('--model=gpt-5.6-terra'))

  const malformed = parseNarutoArgs(['run', 'task', '--agents', '--help'])
  assert.equal(malformed.action, 'help')
  assert.ok(malformed.argumentErrors.includes('missing_option_value:--agents'))
})

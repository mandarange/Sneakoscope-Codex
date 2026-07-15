import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNarutoArgs } from '../../commands/naruto-command.js'

test('Naruto parser treats non-current execution options as unknown', () => {
  for (const args of [
    ['run', 'task', '--backend', 'codex-sdk'],
    ['run', 'task', '--scheduler', 'legacy'],
    ['run', 'task', '--pool-size=8'],
    ['run', 'task', '--model', 'gpt-5.6-terra'],
    ['run', 'task', '--agent', 'worker']
  ]) {
    const parsed = parseNarutoArgs(args)
    assert.ok(parsed.argumentErrors.some((error) => error.startsWith('unsupported_argument:')), args.join(' '))
  }
})

test('Naruto parser rejects missing fanout values, empty tasks, and misplaced subcommands', () => {
  assert.ok(parseNarutoArgs(['run', 'task', '--agents']).argumentErrors.includes('missing_option_value:--agents'))
  assert.ok(parseNarutoArgs(['run', 'task', '--max-threads=']).argumentErrors.includes('missing_option_value:--max-threads'))
  assert.ok(parseNarutoArgs(['run']).argumentErrors.includes('empty_task'))
  assert.ok(parseNarutoArgs(['status', 'run']).argumentErrors.includes('misplaced_subcommand:run'))
  assert.ok(parseNarutoArgs(['dashboard']).argumentErrors.includes('unknown_subcommand:dashboard'))
})

test('Naruto parser keeps explicit scaling and read-only status surfaces', () => {
  const run = parseNarutoArgs(['run', 'bounded task', '--agents=4', '--max-threads', '8'])
  assert.deepEqual({
    action: run.action,
    prompt: run.prompt,
    requestedSubagents: run.requestedSubagents,
    maxThreads: run.maxThreads,
    errors: run.argumentErrors
  }, {
    action: 'run',
    prompt: 'bounded task',
    requestedSubagents: 4,
    maxThreads: 8,
    errors: []
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
  }

  const jsonHelp = parseNarutoArgs(['status', '--help', '--json'])
  assert.equal(jsonHelp.action, 'help')
  assert.equal(jsonHelp.json, true)
})

test('Naruto help does not erase unknown or malformed options', () => {
  const unknown = parseNarutoArgs(['run', 'task', '--model', 'gpt-5.6-terra', '--help'])
  assert.equal(unknown.action, 'help')
  assert.ok(unknown.argumentErrors.includes('unsupported_argument:--model'))

  const malformed = parseNarutoArgs(['run', 'task', '--agents', '--help'])
  assert.equal(malformed.action, 'help')
  assert.ok(malformed.argumentErrors.includes('missing_option_value:--agents'))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { safeReadOnlySubcommand } from '../router.js'

test('active Naruto permits only its read-only observation subcommands', () => {
  for (const subcommand of ['status', 'subagents', 'workers', 'proof']) {
    assert.equal(safeReadOnlySubcommand('naruto', [subcommand, 'latest', '--json']), true, subcommand)
  }
  assert.equal(safeReadOnlySubcommand('naruto', ['run', 'task']), false)
  assert.equal(safeReadOnlySubcommand('naruto', ['proof', 'latest', '--write']), false)
})

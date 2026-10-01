import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { MASS_PARALLEL_AUTOMATIC_SUBAGENT_COUNT, officialSubagentFanoutPolicy, officialSubagentRoleCatalog } from '../agent-catalog.js'
import { buildOfficialSubagentPrompt } from '../official-subagent-prompt.js'
import { EXCLUSIVE_SURFACE_CHILD_RULE, EXCLUSIVE_SURFACE_RULE, EXCLUSIVE_SURFACE_SPAWN_LINE } from '../exclusive-surface-rule.js'
import { exclusiveSurfaceOfRole, exclusiveSurfacesOfOnlyRoles } from '../exclusive-tool-surface.js'

const PINNED_HARDWARE = {
  cores: 4,
  freeMemoryBytes: 3 * 1024 * 1024 * 1024,
  totalMemoryBytes: 16 * 1024 * 1024 * 1024,
  processCount: 40,
  fileDescriptorLimit: 64,
  remoteApiRateLimitBudget: 4
}

test('only the two operator roles own a surface, through every alias and spelling', () => {
  for (const name of ['computer_use_operator', 'computer-use-operator', 'desktop-operator', 'Computer-Use-Operator', 'computer-use-operator.toml', 'sks-official-computer-use-operator']) {
    assert.equal(exclusiveSurfaceOfRole(name), 'computer_use', name)
  }
  for (const name of ['browser_use_operator', 'browser-use-operator', 'chrome-operator', 'web-operator', 'BROWSER_USE_OPERATOR']) {
    assert.equal(exclusiveSurfaceOfRole(name), 'browser', name)
  }
  // Image generation is its own tool; roles that merely mention GUI work are not surface owners.
  for (const name of ['image_generation_operator', 'imagegen-operator', 'explorer', 'ui_implementer', 'native_app_specialist', 'test_engineer', 'default', '', undefined, null]) {
    assert.equal(exclusiveSurfaceOfRole(name), null, String(name))
  }
  // Every catalog role resolves to a surface only when it is one of the two operators.
  const owners = officialSubagentRoleCatalog().filter((role) => exclusiveSurfaceOfRole(role.name) !== null).map((role) => role.name)
  assert.deepEqual(owners.sort(), ['browser_use_operator', 'computer_use_operator'])
})

test('a role set is surface-only when every role is an operator', () => {
  assert.deepEqual(exclusiveSurfacesOfOnlyRoles(['browser_use_operator']), ['browser'])
  assert.deepEqual(exclusiveSurfacesOfOnlyRoles(['browser_use_operator', 'chrome-operator', 'computer_use_operator']), ['browser', 'computer_use'])
  assert.deepEqual(exclusiveSurfacesOfOnlyRoles(['browser_use_operator', 'explorer']), [])
  assert.deepEqual(exclusiveSurfacesOfOnlyRoles([]), [])
  assert.deepEqual(exclusiveSurfacesOfOnlyRoles(undefined), [])
})

test('a goal made only of surface work never joins the 16-child mass lane', () => {
  const massGoal = 'mass browser scan: open hundreds of items in chrome and capture each'
  const massBrowser = officialSubagentFanoutPolicy({
    taskProfile: 'parallel-read',
    goal: massGoal,
    suggestedRoles: ['browser_use_operator'],
    hardware: PINNED_HARDWARE,
    maxThreads: 64
  })
  assert.equal(massBrowser.mass_parallel, false)
  assert.notEqual(massBrowser.requested_subagents, MASS_PARALLEL_AUTOMATIC_SUBAGENT_COUNT)
  assert.doesNotMatch(massBrowser.selection_reason, /mass_parallel/)

  const both = officialSubagentFanoutPolicy({
    taskProfile: 'parallel-read',
    goal: 'bulk exploration of hundreds of native windows and web pages',
    suggestedRoles: ['computer_use_operator', 'browser_use_operator'],
    hardware: PINNED_HARDWARE,
    maxThreads: 64
  })
  assert.equal(both.mass_parallel, false)
  assert.notEqual(both.requested_subagents, MASS_PARALLEL_AUTOMATIC_SUBAGENT_COUNT)

  // The same wording with a non-operator role still gets the mass lane, so the check keys on the roles, not the words.
  const withExplorer = officialSubagentFanoutPolicy({
    taskProfile: 'parallel-read',
    goal: massGoal,
    suggestedRoles: ['explorer', 'browser_use_operator'],
    hardware: PINNED_HARDWARE,
    maxThreads: 64
  })
  assert.equal(withExplorer.mass_parallel, true)
  assert.equal(withExplorer.requested_subagents, MASS_PARALLEL_AUTOMATIC_SUBAGENT_COUNT)
})

test('mixed work and explicit counts keep their fan-out', () => {
  const mixedMass = officialSubagentFanoutPolicy({
    taskProfile: 'parallel-read',
    goal: 'mass search across the whole repository with hundreds of independent shards and check the page in the browser',
    suggestedRoles: ['explorer', 'browser_use_operator'],
    hardware: PINNED_HARDWARE,
    maxThreads: 64
  })
  assert.equal(mixedMass.requested_subagents, 16)
  assert.equal(mixedMass.mass_parallel, true)

  // An operator's own count is authoritative; the gate serializes the surface instead.
  const explicit = officialSubagentFanoutPolicy({
    requestedSubagents: 8,
    requestedExplicit: true,
    goal: 'use the browser',
    suggestedRoles: ['browser_use_operator'],
    hardware: PINNED_HARDWARE,
    maxThreads: 64
  })
  assert.equal(explicit.requested_subagents, 8)
  assert.equal(explicit.selection_reason, 'explicit_operator_count_preserved')
})

test('the delegation prompt carries the single-owner rule and no longer invites a second child per surface', () => {
  const prompt = buildOfficialSubagentPrompt({ goal: 'verify the settings page in the browser', slices: [], maxThreads: 4 })
  assert.ok(prompt.includes(EXCLUSIVE_SURFACE_RULE))
  assert.match(prompt, /non-exclusive tool surfaces/)
  assert.doesNotMatch(prompt, /different tool surfaces/)
  // The wording other tests and the release gate pin stays.
  assert.match(prompt, /C_t = min\(ready DAG width, disjoint ownership, verifier capacity/)
  assert.match(prompt, /parallel writes require disjoint paths/)
})

test('rule texts name the operator roles, exempt image generation, and avoid model names', () => {
  for (const rule of [EXCLUSIVE_SURFACE_RULE, EXCLUSIVE_SURFACE_SPAWN_LINE]) {
    assert.match(rule, /computer_use_operator/)
    assert.match(rule, /browser_use_operator/)
    assert.doesNotMatch(rule, /gpt[- ]?\d/i)
    assert.doesNotMatch(rule, /Browser\/Chrome/)
  }
  assert.match(EXCLUSIVE_SURFACE_RULE, /Image generation is not exclusive/)
  assert.match(EXCLUSIVE_SURFACE_CHILD_RULE, /only owner/)
})

import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentRoster } from '../agent-roster.js'
import { latestTierModelSet } from '../../subagents/model-tiers.js'

test('official Naruto roster routes each agent to the newest model of its tier', () => {
  const roster = buildAgentRoster({
    agents: 3,
    prompt: 'implement the parser and review the security boundary',
    officialSubagentPolicy: true
  })
  const current = latestTierModelSet()
  assert.ok(roster.roster.every((agent) => current.has(String(agent.model))), JSON.stringify(roster.roster.map((agent) => agent.model)))
  // Implementation and security review need different tiers, so not one model.
  assert.ok(new Set(roster.roster.map((agent) => agent.model)).size > 1)
  assert.ok(roster.roster.every((agent) => ['low', 'medium', 'max'].includes(String(agent.model_reasoning_effort || ''))))
  assert.equal(roster.effort_policy.model_catalog_policy, 'official_subagent_four_profile_matrix')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentRoster } from '../agent-roster.js'

test('official Naruto roster policy seals Astra-only four-profile routing', () => {
  const roster = buildAgentRoster({
    agents: 3,
    prompt: 'implement the parser and review the security boundary',
    officialSubagentPolicy: true
  })
  assert.ok(roster.roster.every((agent) => agent.model === 'gpt-6-astra'))
  assert.ok(roster.roster.every((agent) => ['low', 'medium', 'max'].includes(String(agent.model_reasoning_effort || ''))))
  assert.equal(roster.effort_policy.model_catalog_policy, 'official_subagent_four_profile_matrix')
})

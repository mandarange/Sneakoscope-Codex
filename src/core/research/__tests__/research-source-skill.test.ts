import test from 'node:test'
import assert from 'node:assert/strict'
import { createResearchPlan, researchSourceSkillMarkdown } from '../../research.js'

test('route-local Research source skill uses three official reviewers and compatibility-only ledgers', () => {
  const text = researchSourceSkillMarkdown(createResearchPlan('bounded evidence question'))
  assert.match(text, /correlated verified-content Super Search proof/i)
  assert.match(text, /exactly three independent official `research_reviewer` threads/i)
  assert.match(text, /research_synthesizer.*fresh three-thread review cycle/i)
  assert.match(text, /compatibility projections/i)
  assert.doesNotMatch(text, /Continue agent\/debate\/falsification cycles|Every agent must cite|## Debate Use/i)
})

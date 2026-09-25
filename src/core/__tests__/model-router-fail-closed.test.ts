import './helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { modelRouteReason, routeNarutoGpt56Model } from '../provider/model-router.js'
import { BUILTIN_LATEST_TIER_MODELS as T } from '../subagents/model-tiers.js'

// No Codex models cache in the isolated HOME: tiers resolve to the built-in latest family.
const models = [...new Set(Object.values(T))]
const modelEfforts = Object.fromEntries(models.map((model) => [model, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']]))

test('Naruto routing fails closed for an explicit model that is not a current tier model', () => {
  for (const explicitModel of ['gpt-5.4', 'gpt-5.6-luna', 'gpt-5.6-terra']) {
    const choice = routeNarutoGpt56Model({
      taskText: 'implementation',
      explicitModel,
      availableModels: [...models, explicitModel],
      availableModelEfforts: { ...modelEfforts, [explicitModel]: ['low', 'medium', 'max'] }
    })
    assert.equal(choice.model, '', explicitModel)
    assert.equal(modelRouteReason('agentic', choice, { explicit: true }), 'agentic->blocked (explicit model unavailable)')
  }
})

test('Naruto routing preserves a supported explicit current model at the task effort', () => {
  const choice = routeNarutoGpt56Model({
    taskText: 'implementation',
    explicitModel: T.fast.toUpperCase(),
    availableModels: models,
    availableModelEfforts: modelEfforts
  })
  assert.deepEqual(choice, { model: T.fast, reasoning: 'low', serviceTier: 'fast' })
  assert.equal(modelRouteReason('agentic', choice, { explicit: true }), `agentic->${T.fast} (explicit model preserved)`)
})

test('without an explicit model each task picks the newest model of its tier', () => {
  for (const [taskText, model, reasoning] of [
    ['browser QA', T.context, 'medium'],
    ['implementation', T.balanced, 'low'],
    ['security review', T.deep, 'max']
  ] as const) {
    const expected = { model, reasoning, serviceTier: 'fast' }
    assert.deepEqual(routeNarutoGpt56Model({ taskText, availableModels: models, availableModelEfforts: modelEfforts }), expected)
    assert.deepEqual(routeNarutoGpt56Model({ taskText }), expected)
  }
})

test('Naruto routing rejects an unavailable model/effort pair without fallback', () => {
  const choice = routeNarutoGpt56Model({
    taskText: 'browser QA',
    availableModels: models,
    availableModelEfforts: { ...modelEfforts, [T.context]: ['max'] }
  })
  assert.equal(choice.model, '')
  assert.equal(choice.reasoning, 'medium')
})

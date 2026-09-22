import test from 'node:test'
import assert from 'node:assert/strict'
import { modelRouteReason, routeNarutoGpt56Model } from '../provider/model-router.js'

const models = ['gpt-5.6-luna', 'gpt-6-astra']
const modelEfforts = {
  'gpt-5.6-luna': ['xhigh', 'max'],
  'gpt-6-astra': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
}

test('Naruto Luna/Astra routing fails closed for an explicit model outside the family', () => {
  const choice = routeNarutoGpt56Model({
    taskText: 'implementation',
    explicitModel: 'gpt-5.4',
    availableModels: models,
    availableModelEfforts: modelEfforts
  })

  assert.equal(choice.model, '')
  assert.equal(modelRouteReason('agentic', choice, { explicit: true }), 'agentic->blocked (explicit model unavailable)')
})

test('Naruto Luna/Astra routing preserves a supported explicit family model', () => {
  const choice = routeNarutoGpt56Model({
    taskText: 'implementation',
    explicitModel: 'GPT-5.6-LUNA',
    availableModels: models,
    availableModelEfforts: {
      ...modelEfforts,
      'gpt-5.6-luna': ['low', 'max']
    }
  })

  assert.deepEqual(choice, { model: 'gpt-5.6-luna', reasoning: 'low', serviceTier: 'fast' })
  assert.equal(modelRouteReason('agentic', choice, { explicit: true }), 'agentic->gpt-5.6-luna (explicit model preserved)')
})

test('explicit Astra uses the task-specific medium, high, and max effort profiles', () => {
  for (const [taskText, reasoning] of [
    ['browser QA', 'medium'],
    ['implementation', 'low'],
    ['security review', 'max']
  ] as const) {
    const expected = { model: 'gpt-6-astra', reasoning, serviceTier: 'fast' }
    assert.deepEqual(routeNarutoGpt56Model({
      taskText,
      explicitModel: 'GPT-6-ASTRA',
      availableModels: models,
      availableModelEfforts: modelEfforts
    }), expected)
    assert.deepEqual(routeNarutoGpt56Model({ taskText }), expected)
  }
})

test('explicit Sol and Terra stay sealed when their effort is available', () => {
  assert.equal(routeNarutoGpt56Model({
    taskText: 'implementation',
    explicitModel: 'gpt-5.6-sol',
    reasoningEffort: 'low',
    availableModels: [...models, 'gpt-5.6-sol', 'gpt-5.6-terra'],
    availableModelEfforts: { ...modelEfforts, 'gpt-5.6-sol': ['low'], 'gpt-5.6-terra': ['medium'] }
  }).model, 'gpt-5.6-sol')
  assert.equal(routeNarutoGpt56Model({
    taskText: 'browser QA',
    explicitModel: 'gpt-5.6-terra',
    reasoningEffort: 'medium',
    availableModels: [...models, 'gpt-5.6-sol', 'gpt-5.6-terra'],
    availableModelEfforts: { ...modelEfforts, 'gpt-5.6-sol': ['low'], 'gpt-5.6-terra': ['medium'] }
  }).model, 'gpt-5.6-terra')
})

test('Naruto Luna/Astra routing rejects an unavailable model/effort pair without fallback', () => {
  const choice = routeNarutoGpt56Model({
    taskText: 'browser QA',
    availableModels: models,
    availableModelEfforts: { ...modelEfforts, 'gpt-6-astra': ['max'] }
  })
  assert.equal(choice.model, '')
  assert.equal(choice.reasoning, 'medium')
})

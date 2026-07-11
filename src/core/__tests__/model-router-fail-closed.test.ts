import test from 'node:test'
import assert from 'node:assert/strict'
import { modelRouteReason, routeNarutoGpt56Model } from '../provider/model-router.js'

const models = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']
const modelEfforts = {
  'gpt-5.6-luna': ['xhigh', 'max'],
  'gpt-5.6-terra': ['xhigh', 'max', 'ultra'],
  'gpt-5.6-sol': ['xhigh', 'max', 'ultra']
}

test('Naruto GPT-5.6 routing fails closed for an explicit model outside the family', () => {
  const choice = routeNarutoGpt56Model({
    taskText: 'implementation',
    explicitModel: 'gpt-5.4',
    availableModels: models,
    availableModelEfforts: modelEfforts
  })

  assert.equal(choice.model, '')
  assert.equal(modelRouteReason('agentic', choice, { explicit: true }), 'agentic->blocked (explicit model unavailable)')
})

test('Naruto GPT-5.6 routing preserves a supported explicit family model', () => {
  const choice = routeNarutoGpt56Model({
    taskText: 'implementation',
    explicitModel: 'GPT-5.6-LUNA',
    availableModels: models,
    availableModelEfforts: modelEfforts
  })

  assert.deepEqual(choice, { model: 'gpt-5.6-luna', reasoning: 'xhigh', serviceTier: 'fast' })
  assert.equal(modelRouteReason('agentic', choice, { explicit: true }), 'agentic->gpt-5.6-luna (explicit model preserved)')
})

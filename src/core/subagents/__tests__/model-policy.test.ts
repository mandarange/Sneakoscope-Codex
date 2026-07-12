import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SUBAGENT_MODEL,
  NARUTO_PARENT_EFFORT,
  NARUTO_PARENT_MODEL,
  SUBAGENT_EFFORT,
  THINKING_SUBAGENT_MODEL,
  decideSubagentModel
} from '../model-policy.js'
import { decideNarutoCloneEffort, decideOfficialSubagentModel } from '../../agents/agent-effort-policy.js'
import { routeModel, routeNarutoGpt56Model } from '../../provider/model-router.js'

test('official parent and bounded worker use the required Sol/Luna Max policy', () => {
  assert.equal(NARUTO_PARENT_MODEL, 'gpt-5.6-sol')
  assert.equal(NARUTO_PARENT_EFFORT, 'max')
  assert.equal(DEFAULT_SUBAGENT_MODEL, 'gpt-5.6-luna')
  assert.equal(THINKING_SUBAGENT_MODEL, 'gpt-5.6-sol')
  assert.equal(SUBAGENT_EFFORT, 'max')

  assert.deepEqual(decideSubagentModel({ description: 'Apply this exact mechanical rename' }), {
    kind: 'worker',
    model: 'gpt-5.6-luna',
    modelReasoningEffort: 'max',
    reason: 'clear_bounded_repeatable_task'
  })
  assert.equal(decideSubagentModel({ description: 'Build the specified fixture' }).model, 'gpt-5.6-luna')
})

test('every judgment-sensitive signal selects Sol Max', () => {
  const signals = [
    'UI implementation',
    'UX review',
    'debug the failure',
    'planning and strategy',
    'architect role and design',
    'integration conflict',
    'security audit',
    'database migration',
    'release publish',
    'ambiguous trade-off',
    'result quality judgment',
    'safety expert',
    'find the root-cause of failing tests',
    'test debug root cause analysis'
  ]

  for (const description of signals) {
    const decision = decideSubagentModel({ description })
    assert.equal(decision.kind, 'expert', description)
    assert.equal(decision.model, 'gpt-5.6-sol', description)
    assert.equal(decision.modelReasoningEffort, 'max', description)
  }
  assert.equal(decideSubagentModel({ description: 'Handle this task' }).model, 'gpt-5.6-sol')
})

test('official effort policy keeps the legacy function as an exact compatibility alias', () => {
  assert.equal(decideNarutoCloneEffort, decideOfficialSubagentModel)
  const bounded = decideOfficialSubagentModel({
    persona: { role: 'implementer' },
    prompt: 'apply this exact bounded change'
  })
  const review = decideOfficialSubagentModel({
    persona: { role: 'ux' },
    prompt: 'review the screen'
  })

  assert.equal(bounded.model, 'gpt-5.6-luna')
  assert.equal(bounded.model_reasoning_effort, 'max')
  assert.equal(review.model, 'gpt-5.6-sol')
  assert.equal(review.model_reasoning_effort, 'max')
})

test('Naruto automatic routing uses only Luna or Sol at max and fails closed', () => {
  const catalog = {
    availableModels: ['gpt-5.6-luna', 'gpt-5.6-sol'],
    availableModelEfforts: {
      'gpt-5.6-luna': ['max'],
      'gpt-5.6-sol': ['max']
    }
  }
  assert.deepEqual(routeNarutoGpt56Model({ ...catalog, taskText: 'bounded implementation' }), {
    model: 'gpt-5.6-luna', reasoning: 'max', serviceTier: 'fast'
  })
  assert.deepEqual(routeNarutoGpt56Model({ ...catalog, taskText: 'UI debugging review' }), {
    model: 'gpt-5.6-sol', reasoning: 'max', serviceTier: 'fast'
  })
  assert.equal(routeNarutoGpt56Model({
    taskText: 'bounded implementation',
    availableModels: ['gpt-5.6-sol'],
    availableModelEfforts: { 'gpt-5.6-sol': ['max'] }
  }).model, '')
})

test('explicit Terra remains compatible without becoming an automatic default', () => {
  const explicit = routeNarutoGpt56Model({
    taskText: 'bounded implementation',
    explicitModel: 'gpt-5.6-terra',
    availableModels: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'],
    availableModelEfforts: {
      'gpt-5.6-luna': ['max'],
      'gpt-5.6-terra': ['max'],
      'gpt-5.6-sol': ['max']
    }
  })
  const automatic = routeNarutoGpt56Model({ taskText: 'bounded implementation' })

  assert.equal(explicit.model, 'gpt-5.6-terra')
  assert.equal(explicit.reasoning, 'max')
  assert.equal(automatic.model, 'gpt-5.6-luna')
})

test('generic routing preserves an arbitrary explicit non-Naruto model', async () => {
  const choice = await routeModel('agentic', { model: 'future-codex-model' })
  assert.equal(choice.model, 'future-codex-model')
})

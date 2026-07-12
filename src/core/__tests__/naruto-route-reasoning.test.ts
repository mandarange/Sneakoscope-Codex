import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUTES, routeReasoning } from '../routes.js'

const naruto = ROUTES.find((route) => route.id === 'Naruto')
const teamAlias = ROUTES.find((route) => route.id === 'Team')

test('Naruto route reasoning always matches the Sol Max parent policy', () => {
  assert.ok(naruto)
  for (const prompt of [
    'tiny typo fix',
    'terminal config repair',
    'ordinary coding task',
    'run browser e2e verification'
  ]) {
    const result = routeReasoning(naruto, prompt)
    assert.equal(result.effort, 'max', prompt)
    assert.equal(result.profile, 'sks-research-max', prompt)
    assert.equal(result.reason, 'naruto_parent_sol_max', prompt)
  }
})

test('Naruto complex and high-risk parent routes use max reasoning', () => {
  assert.ok(naruto)
  assert.ok(teamAlias)
  for (const route of [naruto, teamAlias]) {
    for (const prompt of [
      'forensic GUI verification',
      'security release migration',
      'refactor the architecture and integration strategy'
    ]) {
      const result = routeReasoning(route, prompt)
      assert.equal(result.effort, 'max', prompt)
      assert.equal(result.profile, 'sks-research-max', prompt)
    }
  }
})

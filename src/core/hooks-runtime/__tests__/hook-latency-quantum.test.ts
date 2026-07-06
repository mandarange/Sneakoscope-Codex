import test from 'node:test'
import assert from 'node:assert/strict'
import { routePrompt } from '../../routes.js'

test('quantum hook scenarios keep route classification bounded', () => {
  assert.equal(routePrompt('$Super-Search run "npm release notes"')?.id, 'SuperSearch')
  assert.equal(routePrompt('Can you fix the failing tests?')?.id, 'Naruto')
  assert.equal(routePrompt('How do I fix this myself?')?.id, 'Answer')
})

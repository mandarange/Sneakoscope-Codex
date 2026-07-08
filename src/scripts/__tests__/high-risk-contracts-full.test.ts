import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HIGH_RISK_CONTRACT_TARGETS,
  evaluateHighRiskFixtures,
  highRiskNegativeFixtures
} from '../../core/security/high-risk-contracts.js'

test('high-risk contracts include required negative fixtures', () => {
  const fixtures = highRiskNegativeFixtures()
  for (const target of HIGH_RISK_CONTRACT_TARGETS) {
    assert.ok(fixtures.some((fixture) => fixture.target === target), `missing fixture for ${target}`)
  }
})

test('high-risk negative fixtures block without ok:true', () => {
  const results = evaluateHighRiskFixtures(highRiskNegativeFixtures())
  assert.ok(results.length >= HIGH_RISK_CONTRACT_TARGETS.length)
  for (const result of results) {
    assert.equal(result.ok, false, `${result.target}/${result.fixture} must not report ok:true`)
    assert.equal(result.status, 'blocked_expected')
    assert.equal(result.blocked, true)
    assert.ok(result.blockers.length > 0)
  }
})

test('high-risk negative fixtures cover all required targets by name', () => {
  const covered = new Set(evaluateHighRiskFixtures(highRiskNegativeFixtures()).map((result) => result.target))
  assert.deepEqual([...HIGH_RISK_CONTRACT_TARGETS].sort(), [...covered].sort())
})

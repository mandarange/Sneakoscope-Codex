import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateHighRiskCliSmokeResult,
  HIGH_RISK_CONTRACT_TARGETS,
  HIGH_RISK_CONTRACT_REPORT_SCHEMA,
  highRiskCliNegativeSmokeSpecs,
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

test('high-risk contract report schema separates fixture and real CLI smoke buckets', () => {
  const static_fixtures = evaluateHighRiskFixtures(highRiskNegativeFixtures())
  const cli_negative_smokes = highRiskCliNegativeSmokeSpecs().map((spec) =>
    evaluateHighRiskCliSmokeResult(spec, {
      exit_code: 1,
      stdout: JSON.stringify({ ok: false, blockers: spec.expected_blockers }),
      stderr: ''
    })
  )
  const report = {
    schema: HIGH_RISK_CONTRACT_REPORT_SCHEMA,
    ok: true,
    static_fixtures,
    cli_negative_smokes,
    blockers: []
  }
  assert.equal(report.schema, 'sks.high-risk-contracts.v2')
  assert.ok(report.static_fixtures.length >= HIGH_RISK_CONTRACT_TARGETS.length)
  assert.deepEqual(
    [...new Set(report.cli_negative_smokes.map((result) => result.target))].sort(),
    [...HIGH_RISK_CONTRACT_TARGETS].sort()
  )
  assert.ok(report.cli_negative_smokes.every((result) => result.blocked))
})

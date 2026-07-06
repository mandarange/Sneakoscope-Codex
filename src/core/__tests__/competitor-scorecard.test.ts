import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { generateCompetitorScorecard, type CompetitorScorecardBaseline } from '../quality/competitor-scorecard.js'

test('competitor scorecard scores missing artifacts as blockers', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scorecard-missing-'))
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '5.8.0', scripts: {} }))

  const baseline: CompetitorScorecardBaseline = {
    schema: 'sks.competitor-scorecard-baseline.v1',
    target: { total_min: 94, each_min: 90 },
    categories: {
      code_stability: [{ id: 'doctor-idempotence', path: '.sneakoscope/reports/doctor-idempotence.json' }],
      test_release_gates: [],
      parallel_isolation: [],
      speed_performance: [],
      install_operations: [],
      maintainability: []
    }
  }

  const result = await generateCompetitorScorecard(root, baseline)
  assert.equal(result.scorecard.scores.code_stability, 0)
  assert.equal(result.ok, false)
  assert.ok(result.scorecard.blockers.includes('code_stability:doctor-idempotence:missing'))
})

test('competitor scorecard derives scores from passing artifacts and package scripts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scorecard-pass-'))
  await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true })
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    version: '5.8.0',
    scripts: {
      'architecture:check': 'node check.js'
    }
  }))
  await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'doctor-idempotence.json'), JSON.stringify({ ok: true }))

  const baseline: CompetitorScorecardBaseline = {
    schema: 'sks.competitor-scorecard-baseline.v1',
    target: { total_min: 94, each_min: 90 },
    categories: {
      code_stability: [{ id: 'doctor-idempotence', path: '.sneakoscope/reports/doctor-idempotence.json' }],
      test_release_gates: [],
      parallel_isolation: [],
      speed_performance: [],
      install_operations: [],
      maintainability: [{ id: 'architecture-check', command: 'architecture:check' }]
    }
  }

  const result = await generateCompetitorScorecard(root, baseline)
  assert.equal(result.scorecard.scores.code_stability, 100)
  assert.equal(result.scorecard.scores.maintainability, 100)
  assert.equal(result.evidence.maintainability[0]?.status, 'passed')
})

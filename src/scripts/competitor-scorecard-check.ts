#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateCompetitorScorecard, type CompetitorScorecardBaseline } from '../core/quality/competitor-scorecard.js'
import { readJson, writeJsonAtomic } from '../core/fsx.js'

const root = process.env.SKS_REPO_ROOT
  ? path.resolve(process.env.SKS_REPO_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const baselinePath = process.env.SKS_COMPETITOR_SCORECARD_BASELINE
  ? path.resolve(process.env.SKS_COMPETITOR_SCORECARD_BASELINE)
  : path.join(root, 'config', 'competitor-scorecard-baseline.json')
const reportPath = process.env.SKS_COMPETITOR_SCORECARD_REPORT
  ? path.resolve(process.env.SKS_COMPETITOR_SCORECARD_REPORT)
  : path.join(root, '.sneakoscope', 'reports', 'competitor-scorecard.json')

const baseline = await readJson<CompetitorScorecardBaseline>(baselinePath)
const result = await generateCompetitorScorecard(root, baseline)
await writeJsonAtomic(reportPath, {
  ...result.scorecard,
  evidence: result.evidence,
  ok: result.ok
})

console.log(JSON.stringify(result.scorecard, null, 2))
if (!result.ok) process.exit(1)

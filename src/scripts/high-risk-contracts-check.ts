#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'
import { evaluateHighRiskFixtures, highRiskNegativeFixtures } from '../core/security/high-risk-contracts.js'

const runtimeHelpers = fs.readFileSync(`${root}/src/core/super-search/runtime-helpers.ts`, 'utf8')
assertGate(runtimeHelpers.includes('evaluateUrlFetchPolicy'), 'Super-Search fetch must use a URL fetch policy preflight')
assertGate(runtimeHelpers.includes('direct_url_fetch_ssrf_blocked'), 'Super-Search fetch must report SSRF blocks')
assertGate(runtimeHelpers.includes('127') && runtimeHelpers.includes('192') && runtimeHelpers.includes('169'), 'SSRF policy must cover local/private IPv4 ranges')
assertGate(runtimeHelpers.includes("lower === '::1'") && runtimeHelpers.includes("lower.startsWith('fc')") && runtimeHelpers.includes("lower.startsWith('fe80:')"), 'SSRF policy must cover local/private IPv6 ranges')

const { runSuperSearch } = await importDist('core/super-search/index.js')
const missionDir = await fs.promises.mkdtemp('/tmp/sks-high-risk-super-search-')
const blocked = await runSuperSearch({
  missionDir,
  query: 'http://127.0.0.1:1/docs',
  mode: 'url_acquisition',
  env: {}
})
assertGate(blocked.ok === false, 'Super-Search fetch must fail closed for private/local URLs by default', blocked)
assertGate(blocked.blockers.some((entry) => String(entry).includes('direct_url_fetch_ssrf_blocked')), 'blocked fetch must include SSRF blocker', blocked.blockers)

const negativeFixtures = highRiskNegativeFixtures()
const negativeResults = evaluateHighRiskFixtures(negativeFixtures)
for (const target of new Set(negativeFixtures.map((fixture) => fixture.target))) {
  const targetResults = negativeResults.filter((result) => result.target === target)
  assertGate(targetResults.some((result) => result.blocked === true), `missing high-risk negative fixture coverage: ${target}`, targetResults)
}
assertGate(
  negativeResults.every((result) => result.ok !== true && result.status === 'blocked_expected' && result.blocked === true),
  'high-risk negative checks must block without ok:true',
  negativeResults
)

const report = {
  schema: 'sks.high-risk-contracts.v1',
  ok: true,
  generated_at: new Date().toISOString(),
  super_search_ssrf_default_block: true,
  static_preflight: true,
  negative_results: negativeResults,
  blockers: []
}
const out = path.join(root, '.sneakoscope', 'reports', 'high-risk-contracts.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)

emitGate('security:high-risk-contracts', {
  super_search_ssrf_default_block: true,
  static_preflight: true,
  negative_fixture_count: negativeResults.length,
  report: '.sneakoscope/reports/high-risk-contracts.json'
})

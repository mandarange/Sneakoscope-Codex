#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

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

emitGate('security:high-risk-contracts', {
  super_search_ssrf_default_block: true,
  static_preflight: true
})

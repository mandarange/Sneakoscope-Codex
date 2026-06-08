#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readJson, readText } from './sks-1-18-gate-lib.js'

const pkg = readJson('package.json')
const manifest = readJson('release-gates.v2.json')
const runner = readText('src/core/release/release-gate-dag.ts')
const scheduler = readText('src/core/release/release-gate-scheduler.ts')
const cache = readText('src/core/release/release-gate-cache-v2.ts')

const releaseCheck = String(pkg.scripts['release:check'] || '')
const delegatedReleaseCheck = releaseCheck.match(/^npm run ([^\s&]+)$/)?.[1]
const effectiveReleaseCheck = delegatedReleaseCheck ? String(pkg.scripts[delegatedReleaseCheck] || '') : releaseCheck

assertGate(
  effectiveReleaseCheck.includes('release-gate-dag-runner.js'),
  'release:check must execute DAG runner',
  { release_check: releaseCheck, delegated_release_check: delegatedReleaseCheck || null, effective_release_check: effectiveReleaseCheck }
)
assertGate(!/&&\s*npm run\s+\w/.test(releaseCheck.replace('npm run build --silent &&', '')), 'release:check must not be a giant npm-run chain', releaseCheck)
assertGate(!/&&\s*npm run\s+\w/.test(effectiveReleaseCheck.replace('npm run build --silent &&', '')), 'effective release:check must not be a giant npm-run chain', effectiveReleaseCheck)
assertGate(pkg.scripts['release:check:legacy'], 'release:check:legacy must exist for explicit debugging')
assertGate(manifest.schema === 'sks.release-gates.v2' && manifest.gates.length >= 10, 'release-gates.v2 manifest must exist with nodes', manifest)
assertGate(runner.includes('Promise.race') && scheduler.includes('pickLaunchableReleaseGates'), 'DAG runner must schedule independent gates concurrently')
assertGate(runner.includes('readReleaseGateCacheHit') && cache.includes('RELEASE_GATE_CACHE_V2_SCHEMA'), 'DAG runner must use release gate cache v2 module')
assertGate(runner.includes('cpu_time_saved_ms') && runner.includes('peak_running') && runner.includes('budget_snapshot'), 'DAG summary must include CPU time saved, peak running gates, and resource budget proof')

emitGate('release:dag-runner', { gates: manifest.gates.length, default_script: releaseCheck, effective_script: effectiveReleaseCheck })

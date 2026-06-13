#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist, readJson, readText } from './sks-1-18-gate-lib.js'

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
for (const gateId of ['scheduler:utilization-integral', 'parallel:runtime-real-blackbox', 'agent:native-cli-session-swarm-20', 'doctor:fix-proves-codex-read', 'codex:0139-real-probes', 'zellij:slot-telemetry-performance', 'naruto:real-parallelism-blackbox']) {
  const gate = manifest.gates.find((row: any) => row.id === gateId)
  assertGate(gate?.resource?.includes('timing-sensitive'), `${gateId} must run in timing-sensitive isolation`, gate)
}
assertGate(runner.includes('Promise.race') && scheduler.includes('pickLaunchableReleaseGates'), 'DAG runner must schedule independent gates concurrently')
assertGate(runner.includes('readReleaseGateCacheRecord') && cache.includes('duration_ms') && cache.includes('RELEASE_GATE_CACHE_V2_SCHEMA'), 'DAG runner must use release gate cache v2 module with cached duration evidence')
assertGate(runner.includes('cpu_time_saved_ms') && runner.includes('peak_running') && runner.includes('budget_snapshot'), 'DAG summary must include CPU time saved, peak running gates, and resource budget proof')
assertGate(runner.includes('detached: process.platform') && runner.includes('killGateProcessTree') && runner.includes('timed_out'), 'DAG runner must kill timed-out gate process trees and record timeout evidence')

const dag = await importDist('core/release/release-gate-dag.js')
const fsx = await importDist('core/fsx.js')
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-dag-timeout-'))
await fsx.writeJsonAtomic(path.join(fixtureRoot, 'release-gates.v2.json'), {
  schema: 'sks.release-gates.v2',
  gates: [{
    id: 'dag:timeout',
    command: `${process.execPath} -e "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"`,
    deps: [],
    resource: ['cpu-light', 'fs-read'],
    side_effect: 'hermetic',
    timeout_ms: 50,
    cache: { enabled: false, inputs: [] },
    isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' },
    preset: ['release']
  }]
})
const timeoutRun = await dag.runReleaseGateDag({ root: fixtureRoot, preset: 'release', full: true, noCache: true })
const timeoutFailure = timeoutRun.failures.find((row: any) => row.id === 'dag:timeout')
const timeoutDuration = timeoutRun.slowest_gates.find((row: any) => row.id === 'dag:timeout')?.duration_ms || 0
assertGate(timeoutRun.ok === false && timeoutRun.failed === 1, 'DAG timeout fixture must fail the run', timeoutRun)
assertGate(timeoutFailure?.exit_code === 124 && timeoutFailure?.timed_out === true, 'DAG timeout fixture must record exit 124 and timed_out evidence', timeoutRun)
assertGate(String(timeoutFailure?.stderr_tail || '').includes('release_gate_timeout:dag:timeout:50ms'), 'DAG timeout fixture must include timeout marker in stderr tail', timeoutRun)
assertGate(timeoutDuration >= 1400, 'DAG timeout fixture must wait for hard-kill cleanup before resolving', timeoutRun)

const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-dag-cache-'))
await fsx.writeJsonAtomic(path.join(cacheRoot, 'package.json'), { name: 'cache-fixture', version: '0.0.0' })
await fsx.writeJsonAtomic(path.join(cacheRoot, 'release-gates.v2.json'), {
  schema: 'sks.release-gates.v2',
  gates: [{
    id: 'dag:cached-duration',
    command: `${process.execPath} -e "const until=Date.now()+80; while(Date.now()<until){}"`,
    deps: [],
    resource: ['cpu-light', 'fs-read'],
    side_effect: 'hermetic',
    timeout_ms: 5000,
    cache: { enabled: true, inputs: [] },
    isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' },
    preset: ['release']
  }]
})
const firstCacheRun = await dag.runReleaseGateDag({ root: cacheRoot, preset: 'release', full: true })
const secondCacheRun = await dag.runReleaseGateDag({ root: cacheRoot, preset: 'release', full: true })
const cachedDuration = secondCacheRun.slowest_gates.find((row: any) => row.id === 'dag:cached-duration')?.duration_ms || 0
assertGate(firstCacheRun.ok === true && firstCacheRun.cached === 0, 'DAG cache fixture first run must execute the gate', firstCacheRun)
assertGate(secondCacheRun.ok === true && secondCacheRun.cached === 1, 'DAG cache fixture second run must hit cache', secondCacheRun)
assertGate(cachedDuration > 0, 'DAG cache fixture must retain nonzero cached duration evidence', secondCacheRun)
assertGate(secondCacheRun.sum_gate_ms >= cachedDuration, 'DAG cache fixture must include cached duration in sum_gate_ms evidence', secondCacheRun)

emitGate('release:dag-runner', { gates: manifest.gates.length, default_script: releaseCheck, effective_script: effectiveReleaseCheck })

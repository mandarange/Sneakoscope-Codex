#!/usr/bin/env node
import { assertGate, emitGate, packageScripts, readText } from './sks-1-18-gate-lib.js'
import { importDist, root } from './sks-1-18-gate-lib.js'

const scripts = packageScripts()
const dagMod = await importDist('core/release/release-gate-dag.js')
const manifest = dagMod.loadReleaseGateManifest(root)
const releaseCount = dagMod.selectReleaseGatePreset(manifest, 'release').length
const dag = readText('src/core/release/release-gate-dag.ts')
const runner = readText('src/scripts/release-gate-dag-runner.ts')
for (const name of ['release:check:affected', 'release:check:full', 'release:check:fast', 'release:check:research']) {
  assertGate(Boolean(scripts[name]), `missing package script ${name}`)
}
assertGate(String(scripts['release:check']).includes('release:check:affected'), 'release:check must default to affected preset')
assertGate(dag.includes('selectAffectedReleaseGates'), 'release DAG must use affected selector')
assertGate(dagMod.selectReleaseGatePreset(manifest, 'affected').length === releaseCount, 'affected preset must select the release gate universe before affected filtering')
assertGate(dagMod.selectReleaseGatePreset(manifest, 'fast').length === releaseCount, 'fast preset must select the release gate universe before affected filtering')
assertGate(runner.includes('--changed-since') && runner.includes('--full'), 'release DAG runner must parse changed-since/full')
emitGate('release:dynamic-presets', { presets: 4 })

#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, packageScripts, readText, root } from './sks-1-18-gate-lib.js'

assertGate(readText('src/scripts/release-speed-summary.ts').includes('sks.release-speed-summary.v1'), 'release speed summary script missing schema')
assertGate(readText('src/scripts/release-speed-summary.ts').includes('mode') && readText('src/scripts/release-speed-summary.ts').includes('max_running'), 'release speed summary must include mode and max_running')
assertGate(Boolean(packageScripts()['release:speed-summary']), 'release:speed-summary package script missing')
const res = spawnSync(process.execPath, ['dist/scripts/release-speed-summary.js'], { cwd: root, encoding: 'utf8', timeout: 30000 })
assertGate(res.status === 0, 'release speed summary command failed', { stderr: res.stderr })
const summary = JSON.parse(res.stdout)
if (summary.mode === 'full' && summary.selected_gates > 1) {
  assertGate(summary.parallelism_gain >= 3 || summary.max_running >= Math.min(8, summary.selected_gates), 'full release speed summary must prove parallelism', summary)
}
emitGate('release:speed-summary', { script: 'release:speed-summary', mode: summary.mode, selected_gates: summary.selected_gates, skipped_by_affected: summary.skipped_by_affected })

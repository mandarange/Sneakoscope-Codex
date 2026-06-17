#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, packageScripts, readText, root } from './sks-1-18-gate-lib.js'

assertGate(readText('src/scripts/release-speed-summary.ts').includes('sks.release-speed-summary.v1'), 'release speed summary script missing schema')
assertGate(readText('src/scripts/release-speed-summary.ts').includes('selected_gate_ids') && readText('src/scripts/release-speed-summary.ts').includes('cached_gates') && readText('src/scripts/release-speed-summary.ts').includes('Affected mode: true'), 'release speed summary must include gate lists and affected-mode warning')
assertGate(readText('src/scripts/release-speed-summary.ts').includes('completion_certificate') && readText('src/scripts/release-speed-summary.ts').includes('proof_bank_file') && readText('src/scripts/release-speed-summary.ts').includes('five_minute_sla_met'), 'release speed summary must expose proof bank and five-minute certificate fields')
assertGate(Boolean(packageScripts()['release:speed-summary']), 'release:speed-summary package script missing')
const res = spawnSync(process.execPath, ['dist/scripts/release-speed-summary.js'], { cwd: root, encoding: 'utf8', timeout: 30000 })
assertGate(res.status === 0, 'release speed summary command failed', { stderr: res.stderr })
const summary = JSON.parse(res.stdout)
for (const key of ['mode', 'selected_gate_ids', 'skipped_gate_ids', 'cached_gates', 'executed_gates', 'max_running', 'parallelism_gain', 'slowest_gates', 'proof_file_path', 'proof_bank_file', 'completion_certificate', 'five_minute_sla_met']) assertGate(Object.prototype.hasOwnProperty.call(summary, key), `release speed summary missing ${key}`, summary)
assertGate(typeof summary.proof_bank_file === 'string' && summary.proof_bank_file.includes('.sneakoscope/proof-bank/gates/cache-v2.json'), 'release speed summary must point at proof bank cache', summary)
if (summary.affected_mode === true) assertGate(String(summary.affected_mode_warning || '').includes('release:check:full'), 'affected mode warning must point to full release check', summary)
if (summary.mode === 'full' && summary.selected_gates > 1) {
  assertGate(summary.parallelism_gain >= 3 || summary.max_running >= Math.min(8, summary.selected_gates), 'full release speed summary must prove parallelism', summary)
}
emitGate('release:speed-summary', { script: 'release:speed-summary', mode: summary.mode, selected_gates: summary.selected_gates, skipped_by_affected: summary.skipped_by_affected })

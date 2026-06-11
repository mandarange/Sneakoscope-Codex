#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-0139-capability.js')
process.env.SKS_CODEX_0139_FAKE = '1'
process.env.SKS_CODEX_VERSION_FAKE = 'codex-cli 0.139.0'
process.env.SKS_CODEX_0139_PROBE = '1'
clearFailureEnv()

const cap = await mod.detectCodex0139Capability({ codexBin: 'codex' })
assertGate(cap.ok === true && cap.probe_mode === 'feature-probe', 'Codex 0.139 feature probe mode must pass fixture', cap)
for (const [name, status] of Object.entries(cap.feature_probe_results || {})) {
  assertGate(status === 'passed', `feature probe must pass: ${name}`, cap.feature_probe_results)
}

process.env.SKS_CODEX_0139_FAKE_RICH_SCHEMA_FAIL = '1'
const failed = await mod.detectCodex0139Capability({ codexBin: 'codex' })
assertGate(failed.ok === false && failed.blockers.includes('codex_rich_tool_schema_probe_failed'), 'rich schema probe failure must block capability', failed)
clearFailureEnv()

emitGate('codex:0139-feature-probes', { probe_mode: cap.probe_mode, probe_count: Object.keys(cap.feature_probe_results || {}).length })

function clearFailureEnv() {
  for (const key of [
    'SKS_CODEX_0139_FAKE_MARKETPLACE_FAIL',
    'SKS_CODEX_0139_FAKE_PROFILE_ALIAS_FAIL',
    'SKS_CODEX_0139_FAKE_INTERRUPT_FAIL',
    'SKS_CODEX_0139_FAKE_RICH_SCHEMA_FAIL',
    'SKS_CODEX_0139_FAKE_DOCTOR_ENV_FAIL',
    'SKS_CODEX_0139_FAKE_WEB_SEARCH_FAIL'
  ]) delete process.env[key]
}

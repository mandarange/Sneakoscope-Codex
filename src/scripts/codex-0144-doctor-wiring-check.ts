#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

process.env.SKS_CODEX_0144_FAKE = '1'
process.env.SKS_CODEX_0138_FAKE = '1'
process.env.SKS_CODEX_0139_FAKE = '1'
process.env.SKS_CODEX_0140_FAKE = '1'
process.env.SKS_CODEX_PLUGIN_JSON_FAKE = '1'

const { buildCodexNativeFeatureMatrix } = await importDist('core/codex-native/codex-native-feature-broker.js')
const matrix = await buildCodexNativeFeatureMatrix({ root: process.cwd(), mode: 'read-only' })
const report = {
  schema: 'sks.codex-0144-doctor-wiring-check.v1',
  codex_0144: matrix.features.codex_0144?.ok,
  multi_agent_mode: matrix.features.multi_agent_mode?.ok,
  rollout_budget: matrix.features.rollout_budget?.ok,
  indexed_web_search: matrix.features.indexed_web_search?.ok,
  current_time_read: matrix.features.current_time_read?.ok,
  invocation_defaults: matrix.invocation_defaults
}

assertGate(report.codex_0144 === true && report.multi_agent_mode === true && report.rollout_budget === true && report.indexed_web_search === true && report.current_time_read === true, 'Codex 0.144.5 capability must feed Doctor/native runtime feature matrix', report)
emitGate('codex-native:0144-doctor-wiring', report)

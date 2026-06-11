#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-0139-real-probe-summary.js')
const { summary } = await mod.writeCodex0139RealProbeSummary(root)
assertGate(summary.schema === 'sks.codex-0139-real-probe-summary.v1', 'Codex 0.139 real probe summary schema mismatch', summary)
assertGate(summary.require_real ? summary.ok === true : true, 'require-real probe summary must have no skipped or failed probes', summary)
emitGate('codex:0139-real-probe-summary', {
  summary_ok: summary.ok,
  actual_cli_probe_count: summary.actual_cli_probe_count,
  skipped_count: summary.skipped_count,
  failed_count: summary.failed_count
})

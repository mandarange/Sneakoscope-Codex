#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-0139-plugin-real-probes.js')
const runner = await importDist('core/codex-control/codex-0139-probe-runner.js')
const codexBin = await runner.findCodex0139RealProbeBinary()
const result = await mod.runCodex0139PluginCacheRealProbe({ root, requireReal: true, timeoutMs: Number(process.env.SKS_CODEX_0139_REAL_PROBE_TIMEOUT_MS || 60000), codexBin })
assertGate(result.ok === true, 'Codex 0.139 plugin cached catalog real probe must pass', result)
emitGate('codex:0139-plugin-cache-real', result.evidence)

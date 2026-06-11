#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-0139-web-search-probe.js')
const runner = await importDist('core/codex-control/codex-0139-probe-runner.js')
const codexBin = await runner.findCodex0139RealProbeBinary()
const result = await mod.runCodex0139WebSearchRealProbe({ root, requireReal: true, allowNetwork: true, timeoutMs: Number(process.env.SKS_CODEX_0139_REAL_PROBE_TIMEOUT_MS || 120000), codexBin })
assertGate(result.ok === true, 'Codex 0.139 code-mode web search real probe must pass', result)
emitGate('codex:0139-code-mode-web-search-real', result.evidence)
